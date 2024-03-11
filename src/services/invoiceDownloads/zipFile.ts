import {AwsHelper} from '../awsHelper/awsHelper';
import moment from 'moment';
import path from 'path';
import fs from "fs";
import {ConfigService} from "../config/config.service";
import AWS from "aws-sdk";
import AdmZip from 'adm-zip';
import {InvoiceHelpers} from '../invoiceHelper/invoiceHelpers';

export class ZipFile {

    private awsHelper: AwsHelper;
    private invoiceHelpers: InvoiceHelpers;

    constructor() {
        this.awsHelper = new AwsHelper();
        this.invoiceHelpers = new InvoiceHelpers();
        AWS.config.update({
            accessKeyId: ConfigService.configs.aws.AWSAccessKeyId,
            secretAccessKey: ConfigService.configs.aws.secretKey
        });
    }

    public async createZip(request: any): Promise<any> {

        let companyId: any = 0;

        const tempDirectory = '/tmp';
        const fileName = `Invoices-${moment().format('MMDDYYYYhhmma')}.zip`;
        const filePath = path.join(tempDirectory, fileName);

        const zip = new AdmZip();

        const successBlobs = [];
        const successInvoice = [];
        const failedInvoice = [];
        const failedBlobs= [];

        for (const invoiceData of request) {

            const invoice = invoiceData.Payload.body
            invoice.batchLog.errors = [];
            companyId = invoice.companyId
            const errors = [];

            if (invoice.files.length > 0) {
                successInvoice.push(invoice)
                successBlobs.push(invoice.batchLog)
                for (const item of invoice.files) {
                    const doc = await this.awsHelper.getDocument(item, invoice)
                    if (doc.url) {
                        zip.addLocalFile(doc.url);
                    } else {
                        errors.push(`Failed to Get Document : ${item.name}`)
                    }
                }
            } else {
                failedInvoice.push(invoice)
                failedBlobs.push(invoice.errors)
            }
            invoice.batchLog.errors.push(errors)
        }

        zip.writeZip(filePath)

        let signedUrl: any = null
        if (successBlobs.length > 0) {
            const key = `company/${companyId}/workOrder/${fileName}`;
            const s3 = new AWS.S3();
            const zipBuffer = fs.readFileSync(filePath);
            await s3.upload({
                Bucket: ConfigService.configs.aws.bucket,
                Key: key,
                Body: zipBuffer,
                ContentType: 'application/zip'
            }).promise();

            const params2 = {
                Bucket: ConfigService.configs.aws.bucket,
                Key: key, // The key of the object you want to access
                Expires: 3600, // The URL will expire in seconds (1 hour in this case)
            };

            signedUrl = s3.getSignedUrl('getObject', params2);
        }

        const bLog = {} as any;
        if (successInvoice.length > 0) {

            bLog.details = JSON.stringify({blobs: successBlobs, failedBlobs, signedUrl});
            bLog.batchNumber = successInvoice[0].batchNumber;
            bLog.id = successInvoice[0].batchId;
            bLog.userId = successInvoice[0].userId;
            bLog.status = 'Success'
            await this.invoiceHelpers.insertFactorBatchLog(bLog);

        } else if (failedInvoice.length > 0){

            bLog.details = JSON.stringify({blobs: successBlobs, failedBlobs, signedUrl: null });
            bLog.batchNumber = failedInvoice[0].batchNumber;
            bLog.id = failedInvoice[0].batchId;
            bLog.userId = failedInvoice[0].userId;
            bLog.status = 'Failure'
            await this.invoiceHelpers.insertFactorBatchLog(bLog);

        }

        return { signedUrl, bLog }
    }
}