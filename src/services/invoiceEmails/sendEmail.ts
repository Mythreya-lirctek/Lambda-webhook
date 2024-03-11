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

        const isSingleEmail = request[0].Payload.body.isSingleEmail ? request[0].Payload.body.isSingleEmail : 1
        if (isSingleEmail === 1){

            let attachments: any = [];
            for (let i = 0; i < request.length; i++) {
                const invoice = request[i].Payload.body
                allInvoices.push(invoice)

                if (invoice.documents.length === 0) {
                    failedInvoice.push(invoice)
                    failedBlobs.push(invoice.errors)
                }

                const localFilePath = [];
                for (const item of invoice.files) {
                    const doc = await this.awsHelper.getDocument(item, invoice)
                    if (doc.url) {
                        localFilePath.push(doc)
                        const bitmap = fs.readFileSync(doc.url);
                        attachments.push({
                            content: Buffer.from(bitmap).toString('base64'),
                            name: doc.name,
                            type: 'application/pdf'
                        });

                        successInvoice.push(invoice)
                        successBlobs.push(invoice.batchLog)
                    } else {
                        failedInvoice.push(invoice)
                        failedBlobs.push(invoice.errors)
                    }
                }

                console.log(attachments.length, 'Length')
                const subject = invoice.refNumber ? `Reference# : ${invoice.refNumber}` : `Reference# : -`
                if (emails.length > 0 && attachments.length > 0){
                    for(const email of emails){
                        const result = await this.sendEmail(email, fromEmail, 'invoice', body, attachments, subject)
                        console.log(result)
                        if (result.response){
                            resultData.push({email, result : result.response})
                        } else {

                            console.log(localFilePath)
                            if (localFilePath.length === 1){

                                const fileContent = fs.readFileSync(localFilePath[0].url);

                                const key = `company/${companyId}/workOrder/${localFilePath[0].name}.pdf`;
                                const s3 = new AWS.S3();
                                await s3.upload({
                                    Bucket: ConfigService.configs.aws.bucket,
                                    Key: key,
                                    Body: fileContent,
                                    ContentType: 'application/pdf'
                                }).promise();

                                const params2 = {
                                    Bucket: ConfigService.configs.aws.bucket,
                                    Key: key, // The key of the object you want to access
                                    Expires: 604800, // 7 Days
                                };

                                const signedUrl = s3.getSignedUrl('getObject', params2);
                                const newSubject = invoice.refNumber ? `Reference# : ${invoice.refNumber}` : `Reference# : -`
                                const newBody = `<div><br />Dear Customer,<br />Please click on the following link to download the documents, this link will be expired in 7 days <br /> <br />Download URL<br /> ${signedUrl}<br /> <br /> </div>`

                                const result = await this.sendEmail(email, fromEmail, 'invoice', newBody, null, newSubject)
                                resultData.push({email, result: result.response})

                            } else {

                                const documentAwsUrl = await this.awsHelper.getDocumentMergeAndPush(invoice.files, invoice)
                                if (documentAwsUrl.mergedUrl) {

                                    const s3 = new AWS.S3();

                                    const params2 = {
                                        Bucket: ConfigService.configs.aws.bucket,
                                        Key: documentAwsUrl.mergedUrl, // The key of the object you want to access
                                        Expires: 604800, // 7 Days
                                    };

                                    const signedUrl = s3.getSignedUrl('getObject', params2);
                                    const newSubject = invoice.refNumber ? `Reference# : ${invoice.refNumber}` : `Reference# : -`
                                    const newBody = `<div><br />Dear Customer,<br />Please click on the following link to download the documents, this link will be expired in 7 days <br /> <br />Download URL<br /> <a href=${signedUrl}><br /> <br /> </div>`

                                    const result = await this.sendEmail(email, fromEmail, 'invoice', newBody, null, newSubject)
                                    resultData.push({email, result: result.response})

                                }

                            }

                        }
                    }
                    attachments = [];
                }

            }
            return await this.updateInvoice(successInvoice, failedInvoice, successBlobs, failedBlobs, resultData);

        } else {

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
            const newBody = `<div><br />Dear Customer,<br />Please click on the following link to download the documents, this link will be expired in 7 days <br /> <br />Download URL<br /> <a href=${signedUrl}><br /> <br /> </div>`
            for (const email of emails) {
                const result = await this.sendEmail(email, fromEmail, 'invoice', newBody, null, subject)
                resultData.push({email, result: result.response})
            }

            return await this.updateInvoice(successInvoice, failedInvoice, successBlobs, failedBlobs, resultData);
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
            const response: any = await client.messages.sendTemplate(message);
            console.log('Sending Email')
            if (response.length > 0){
                return {response, message : 'Email Sent Successfully'};
            } else {
                console.error(response);
                return { error : 'Failed to Send Message', message : 'Email Sending Failed'};
            }


        } catch (err: any) {
            console.error(err);
            return { error : 'Failed to Send Message', message : 'Email Sending Failed'};
        }
    }

}