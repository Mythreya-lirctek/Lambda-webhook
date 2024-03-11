import AWS from 'aws-sdk';
import {ConfigService} from '../config/config.service';
import * as console from 'console';
import {InvoiceHelpers} from '../invoiceHelper/invoiceHelpers';
import {AwsHelper} from '../awsHelper/awsHelper';

export class PrintInvoice {

    private invoiceHelpers: InvoiceHelpers;
    private awsHelper: AwsHelper;

    constructor() {
        this.invoiceHelpers = new InvoiceHelpers();
        this.awsHelper = new AwsHelper();
        AWS.config.update({
            accessKeyId: ConfigService.configs.aws.AWSAccessKeyId,
            secretAccessKey: ConfigService.configs.aws.secretKey
        });
    }

    public async printAllInvoices(invoiceList : any): Promise<any>{

        const successBlobs = [];
        const successInvoice = [];
        const failedInvoice = [];
        const failedBlobs= [];
        const files = [];

        for (const invoiceData of invoiceList){

            const invoice = invoiceData.Payload.body;

            if (invoice.files.length > 0) {
                successInvoice.push(invoice);
                files.push(invoice.files[0]);
                successBlobs.push(invoice.batchLog)
            } else {
                failedInvoice.push(invoice);
                failedBlobs.push(invoice.errors)
            }

        }

        const bLog = {} as any;
        if (files.length > 0){
            const invoice = successInvoice[0]

            const documentAwsUrl = await this.awsHelper.getDocumentMergeAndPush(files, invoice)
            if (documentAwsUrl.mergedUrl) {

                const s3 = new AWS.S3();

                const params2 = {
                    Bucket: ConfigService.configs.aws.bucket,
                    Key: documentAwsUrl.mergedUrl, // The key of the object you want to access
                    Expires: 3600, // The URL will expire in seconds (1 hour in this case)
                };

                const signedUrl = s3.getSignedUrl('getObject', params2);

                bLog.details = JSON.stringify({blobs: successBlobs, failedBlobs, signedUrl: signedUrl});
                bLog.batchNumber = successInvoice[0].batchNumber;
                bLog.id = successInvoice[0].batchId;
                bLog.userId = successInvoice[0].userId;
                bLog.status = 'Success'
                await this.invoiceHelpers.insertFactorBatchLog(bLog);

                if (invoice.type === 4){
                    console.log('Changing Status to Invoiced')
                    const date = new Date();
                    const issuedDate = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
                    for (const item of successInvoice) {
                        const updateResult = await this.invoiceHelpers.saveWorkOrder({
                            status_Id: 11,
                            userId: item.userId,
                            workOrderId: Number(item.workOrderId)
                        });
                        if (updateResult) {
                            await this.invoiceHelpers.updateDOandRelayStatusbyWOId(Number(item.workOrderId), 11);
                            await this.invoiceHelpers.saveWOInvoice({
                                issuedDate,
                                userId: item.userId,
                                woInvoiceId: item.woInvoiceId
                            });
                        }
                    }
                }

            } else {

                bLog.details = JSON.stringify({blobs: successBlobs, failedBlobs, signedUrl: null, error: 'Failed to merge Document' });
                bLog.batchNumber = successInvoice[0].batchNumber;
                bLog.id = successInvoice[0].batchId;
                bLog.userId = successInvoice[0].userId;
                bLog.status = 'Failure'
                await this.invoiceHelpers.insertFactorBatchLog(bLog);

            }

        } else {

            if (failedInvoice.length > 0){

                bLog.details = JSON.stringify({blobs: successBlobs, failedBlobs, signedUrl: null });
                bLog.batchNumber = failedInvoice[0].batchNumber;
                bLog.id = failedInvoice[0].batchId;
                bLog.userId = failedInvoice[0].userId;
                bLog.status = 'Failure'
                await this.invoiceHelpers.insertFactorBatchLog(bLog);

            } else {
                bLog.status = 'There are Empty Invoices'
            }

        }
        return bLog

    }

}