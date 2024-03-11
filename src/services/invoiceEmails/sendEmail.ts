import {AwsHelper} from '../awsHelper/awsHelper';
import fs from 'fs';
import {ConfigService} from '../config/config.service';
import console from 'console';
import mailchimpTransactional from '@mailchimp/mailchimp_transactional';
import {InvoiceHelpers} from '../invoiceHelper/invoiceHelpers';
import moment from 'moment/moment';
import path from 'path';
import AdmZip from 'adm-zip';
import AWS from 'aws-sdk';


export class SendEmail {

    private awsHelper: AwsHelper;
    private invoiceHelpers: InvoiceHelpers;

    constructor() {
        this.awsHelper = new AwsHelper();
        this.invoiceHelpers = new InvoiceHelpers();
    }

    public async processDocumentsAndSendEmail(request: any): Promise<any> {

        const resultData = [];
        let attachments = [] as any;

        let companyId: any = request[0].Payload.body.companyId;

        const emails = request[0].Payload.body.emails
        const fromEmail = request[0].Payload.body.fromEmail
        const subject = request[0].Payload.body.subject
        const body = request[0].Payload.body.body

        const allInvoices: any = [];
        const successBlobs: any = [];
        const successInvoice: any = [];
        const failedInvoice: any = [];
        const failedBlobs: any= [];

        const tempDirectory = '/tmp';
        const fileName = `Invoices-${moment().format('MMDDYYYYhhmma')}.zip`;
        const filePath = path.join(tempDirectory, fileName);

        const zip = new AdmZip();

        for (let i = 0; i < request.length; i++) {

            const invoice = request[i].Payload.body
            allInvoices.push(invoice)
            invoice.batchLog.errors = [];
            const errors = [];
            for (const item of invoice.files) {
                const doc = await this.awsHelper.getDocument(item, invoice)
                if (doc.url) {
                    zip.addLocalFile(doc.url);
                } else {
                    errors.push(`Failed to Get Document : ${item.name}`)
                }
            }
            invoice.batchLog.errors.push(errors)

            if (invoice.files.length > 0) {
                successInvoice.push(invoice)
                successBlobs.push(invoice.batchLog)
            } else {
                failedInvoice.push(invoice)
                failedBlobs.push(invoice.errors)
            }
        }
        zip.writeZip(filePath)

        const stats = fs.statSync(filePath);
        const fileSizeInBytes = stats.size
        const fileSizeInMegaBytes = fileSizeInBytes / (1024 * 1024);

        if (fileSizeInMegaBytes > 7){

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
                Expires: 604800, // 7 Days
            };

            const signedUrl = s3.getSignedUrl('getObject', params2);
            const newBody = `<div><br /> ${body}<br /> <br />Document URL<br /> ${signedUrl}<br /> <br />Note<br />This link is valid for 7 Days<br /> </div>`
            for (const email of emails) {
                const result = await this.sendEmail(email, fromEmail, 'invoice', newBody, null, subject)
                resultData.push({email, result: result.response})
            }

            return await this.updateInvoice(successInvoice, failedInvoice, successBlobs, failedBlobs, resultData);

        } else {

            try {
                const bitmap = fs.readFileSync(filePath);
                attachments.push({
                    content: Buffer.from(bitmap).toString('base64'),
                    name: path.parse(filePath),
                    type: 'application/zip'
                });

                for (const email of emails) {
                    const result = await this.sendEmail(email, fromEmail, 'invoice', body, attachments, subject)
                    resultData.push({email, result: result.response})
                }

                return await this.updateInvoice(successInvoice, failedInvoice, successBlobs, failedBlobs, resultData);

            } catch (e) {
                return await this.updateInvoice([], allInvoices, successBlobs, failedBlobs, {error: e});
            }

        }

    }

    private async updateInvoice(successInvoice: any, failedInvoice: any, successBlobs: any, failedBlobs: any, resultData: any): Promise<any> {
        for (const invoice of successInvoice){

            await this.invoiceHelpers.addWOInvoiceLog(invoice);
            await this.invoiceHelpers.addActivityLog({
                activityType: 'Email Sent',
                description: JSON.stringify(invoice),
                module: 'WOinvoice',
                module_Id: invoice.woInvoiceId,
                userId: invoice.userId,
            });

            
            if (invoice.status === 5) {
                const d = new Date();
                invoice.issuedDate = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

                const updateResult = await this.invoiceHelpers.saveWorkOrder({
                    workOrderId: Number(invoice.workOrderId),
                    userId: invoice.userId,
                    status_Id: 11
                });
                if (updateResult) {
                    await this.invoiceHelpers.updateDOandRelayStatusbyWOId(Number(invoice.workOrderId), 11);
                    await this.invoiceHelpers.saveWOInvoice({
                        issuedDate: invoice.issuedDate,
                        userId: invoice.userId,
                        woInvoiceId: invoice.woInvoiceId
                    });
                }
            }
        }

        const bLog = {} as any;
        if (successInvoice.length > 0) {

            bLog.details = JSON.stringify({blobs: successBlobs, failedBlobs, resultData});
            bLog.batchNumber = successInvoice[0].batchNumber;
            bLog.id = successInvoice[0].batchId;
            bLog.userId = successInvoice[0].userId;
            bLog.status = 'Success'
            await this.invoiceHelpers.insertFactorBatchLog(bLog);

        } else if (failedInvoice.length > 0){

            bLog.details = JSON.stringify({blobs: successBlobs, failedBlobs, resultData : 'No Data to Send'});
            bLog.batchNumber = failedInvoice[0].batchNumber;
            bLog.id = failedInvoice[0].batchId;
            bLog.userId = failedInvoice[0].userId;
            bLog.status = 'Failure'
            await this.invoiceHelpers.insertFactorBatchLog(bLog);

        }
        bLog.message = 'Email Status'
        return bLog
    }

    public async sendEmail(to:any, from:any, templateName:any, body:any, attachments:any, subject:any): Promise<any>{
        try {
            const apiKey = ConfigService.configs.mandrill.apikey;
			const client = mailchimpTransactional(apiKey)

            let message: any;
            if (attachments === null){
                message = {
                    template_name: templateName,
                    template_content: [
                        {
                            content: body,
                            name: 'body'
                        }
                    ],
                    message: {
                        to: [{email: to}],
                        subject: subject,
                        fromEmail: from,
                        content: body,
                        global_merge_vars: [
                            {
                                content: body,
                                name: 'body'
                            }
                        ],
                    },
                };
            } else {
                message = {
                    template_name: templateName,
                    template_content: [
                        {
                            content: body,
                            name: 'body'
                        }
                    ],
                    message: {
                        to: [{email: to}],
                        subject: subject,
                        attachments,
                        fromEmail: from,
                        content: body,
                        global_merge_vars: [
                            {
                                content: body,
                                name: 'body'
                            }
                        ],
                    },
                };
            }
            const response = await client.messages.sendTemplate(message);
            console.log('Sending Email')
            return {response, message : 'Email Sent Successfully'};

        } catch (err: any) {
            console.error(err);
            return { error : err.message, message : 'Email Sending Failed'};
        }
    }

}