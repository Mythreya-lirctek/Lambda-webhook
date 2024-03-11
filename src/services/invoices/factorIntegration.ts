import {Database} from '../database/database';
import moment from 'moment';
import { createTheFile, stringToStream } from '../../utils/file.util';
import {parse} from 'json2csv';
import * as ftp from 'basic-ftp';
import path from 'path';
import AWS from 'aws-sdk';
import Client from 'ssh2-sftp-client';
import {ConfigService} from '../config/config.service';
import * as console from 'console';
import {InvoiceHelpers} from '../invoiceHelper/invoiceHelpers';
import {AwsHelper} from '../awsHelper/awsHelper';

export class FactorIntegration {

    private dataBaseGet: Database;
    private invoiceHelpers: InvoiceHelpers;
    private awsHelper: AwsHelper;

    constructor() {
        this.dataBaseGet = new Database(true);
        this.invoiceHelpers = new InvoiceHelpers();
        this.awsHelper = new AwsHelper();
        AWS.config.update({
            accessKeyId: ConfigService.configs.aws.AWSAccessKeyId,
            secretAccessKey: ConfigService.configs.aws.secretKey
        });
    }

    public async getCompanyIntegration(companyId: number,
                                       integrationType:string,
                                       isBrokerage: number = 0): Promise<any> {
        return this.dataBaseGet.query(
            `select * from companyintegrations where Company_Id=${companyId} and 
                    IntegrationType='${integrationType}' and 
                    IsBrokerage=${isBrokerage}`
        );

    }

    public async sendToFactor(invoiceList: any): Promise<any>{

        const companyId =  invoiceList[0].Payload.body.companyId
        const isBrokerage =  invoiceList[0].Payload.body.isBrokerage
        const companyIntegrationDetails: any = await this.getCompanyIntegration(companyId, 'Factor', isBrokerage)

        if (companyIntegrationDetails.data
            && companyIntegrationDetails.data.length > 0
            && companyIntegrationDetails.data[0]) {

            const writer: any[] = [];
            const tempDirectory = '/tmp';
            const csvFileName = `${moment().format('MMDDYYYYhhmma')}.csv`;
            const csvFilePath = path.join(tempDirectory, csvFileName);

            const integrationDetails = companyIntegrationDetails.data[0]

            const blobs = [];
            if (integrationDetails.Partner === 'RTS' ) {

                const files = [];
                const allInvoice = [];
                const successInvoice = [];
                const failedInvoice = [];
                const failedBlobs= [];

                for (const invoiceData of invoiceList){

                    const invoice = invoiceData.Payload.body
                    allInvoice.push(invoice)

                    if (invoiceData.Payload.statusCode === 200 && invoice.files.length > 0) {

                        const invoiceDocument = await this.awsHelper.generateInvoiceDocument(invoice.files[0], invoice)
                        if (invoiceDocument.url) {

                            successInvoice.push(invoice)
                            files.push({url: invoiceDocument.url, name: `${invoice.loadNumber}.pdf`})
                            const csvData = {
                                'Client': integrationDetails.UserName,
                                'Invoice#': invoice.loadNumber,
                                'DebtorNo': invoice.customerName,
                                'Debtor Name': invoice.customerName,
                                'Load #': invoice.refNumber,
                                'InvDate': invoice.invoicedDate ? moment(invoice.invoicedDate, moment.ISO_8601).format('MM/DD/YYYY') : moment().format('MM/DD/YYYY'),
                                'InvAmt': invoice.invoiceAmount
                            };
                            writer.push(csvData);
                            blobs.push(invoice.batchLog)

                        } else if (invoiceDocument.message){
                            const error = invoiceDocument.message;
                            invoice.errors.push({ invoice_Id: invoice.woInvoiceId, invoiceNumber: invoice.loadNumber, error });
                            failedInvoice.push(invoice)
                            failedBlobs.push(invoice.errors)
                        }
                    } else {
                        failedInvoice.push(invoice)
                        failedBlobs.push(invoice.errors)
                    }
                }

                console.log(successInvoice, 'Success Invoices')
                console.log(failedInvoice, 'Failed Invoices')
                console.log(blobs, 'Success Blobs')
                console.log(failedBlobs, 'Failed Blobs')

                try {
                    if (writer.length > 0 && files.length > 0) {

                        const csv = parse(writer);
                        await createTheFile(stringToStream(csv), csvFilePath)
                        files.push({url: csvFilePath, name: csvFileName});
                        const result = await this.ftpUpload(files, integrationDetails);
                        return this.updateBlob(result, successInvoice, failedInvoice, blobs, failedBlobs)

                    } else {
                        return this.updateBlob({
                            message : 'No Files to Upload to FTP'
                        }, successInvoice, failedInvoice, blobs, failedBlobs)
                    }
                } catch (e) {
                    console.log(e)
                    const error = {
                        message : 'Failed to Upload to FTP, Please Contact Admin'
                    }
                    await this.updateErrorBlog(allInvoice, error)
                }

            } else if (integrationDetails.Partner === 'Triumph' ) {

                const files = [];
                const allInvoice = [];
                const successInvoice = [];
                const failedInvoice = [];
                const failedBlobs= [];

                for (const invoiceData of invoiceList){

                    const invoice = invoiceData.Payload.body
                    allInvoice.push(invoice)

                    if (invoiceData.Payload.statusCode === 200 && invoice.files.length > 0) {

                        const invoiceDocument = await this.awsHelper.generateInvoiceDocument(invoice.files[0], invoice)
                        if (invoiceDocument.url) {

                            successInvoice.push(invoice)
                            files.push({url: invoiceDocument.url, name: `${invoice.loadNumber}.pdf`})
                            writer.push({
                                'DESCR': invoice.description ? invoice.description : '',
                                'DTR_NAME': invoice.customerName,
                                'INVAMT': invoice.invoiceAmount,
                                'INVOICE#': invoice.loadNumber,
                                'INV_DATE': invoice.invoicedDate ? moment(invoice.invoicedDate, moment.ISO_8601).format('MM/DD/YYYY') : moment().format('MM/DD/YYYY'),
                                'PO': invoice.refNumber
                            });
                            blobs.push(invoice.batchLog)

                        } else if (invoiceDocument.message){
                            const error = invoiceDocument.message;
                            invoice.errors.push({ invoice_Id: invoice.woInvoiceId, invoiceNumber: invoice.loadNumber, error });
                            failedInvoice.push(invoice)
                            failedBlobs.push(invoice.errors)
                        }
                    } else {
                        failedInvoice.push(invoice)
                        failedBlobs.push(invoice.errors)
                    }
                }

                console.log(successInvoice, 'Success Invoices')
                console.log(failedInvoice, 'Failed Invoices')
                console.log(blobs, 'Success Blobs')
                console.log(failedBlobs, 'Failed Blobs')

                try {
                    if (writer.length > 0 && files.length > 0) {

                        const csv = parse(writer);
                        await createTheFile(stringToStream(csv), csvFilePath)
                        files.push({url: csvFilePath, name: csvFileName});
                        const result = await this.sftpUpload(files, integrationDetails);
                        return this.updateBlob(result, successInvoice, failedInvoice, blobs, failedBlobs)

                    } else {
                        return this.updateBlob({
                            message : 'No Files to Upload to SFTP'
                        }, successInvoice, failedInvoice, blobs, failedBlobs)
                    }
                } catch (e) {
                    console.log(e)
                    const error = {
                        message : 'Failed to Upload to FTP, Please Contact Admin'
                    }
                    await this.updateErrorBlog(allInvoice, error)
                }

            } else if (integrationDetails.Partner === 'Otr' ) {

                const files = [];
                const allInvoice = [];
                const successInvoice = [];
                const failedInvoice = [];
                const failedBlobs= [];

                for (const invoiceData of invoiceList){

                    const invoice = invoiceData.Payload.body
                    allInvoice.push(invoice)

                    if (invoiceData.Payload.statusCode === 200 && invoice.files.length > 0) {

                        const invoiceDocument = await this.awsHelper.generateInvoiceDocument(invoice.files[0], invoice)
                        if (invoiceDocument.url) {

                            successInvoice.push(invoice)
                            files.push({url: invoiceDocument.url, name: `${invoice.loadNumber}.pdf`})
                            writer.push({
                                'Client': invoice.otrClientNumber,
                                'Debtor Name': invoice.customerName,
                                'DestinationCity': invoice.deliveryCity,
                                'DestinationState': invoice.deliveryState,
                                'InvDate': invoice.invoicedDate ? moment(invoice.invoicedDate, moment.ISO_8601).format('MM/DD/YYYY') : moment().format('MM/DD/YYYY'),
                                'Invamt': invoice.invoiceAmount,
                                'Invoice#': invoice.loadNumber,
                                'MCNumber': invoice.mcNumber,
                                'Pono': invoice.refNumber,
                                'StartCity': invoice.pickupCity,
                                'StartState': invoice.pickupState
                            });
                            blobs.push(invoice.batchLog)

                        } else if (invoiceDocument.message){
                            const error = invoiceDocument.message;
                            invoice.errors.push({ invoice_Id: invoice.woInvoiceId, invoiceNumber: invoice.loadNumber, error });
                            failedInvoice.push(invoice)
                            failedBlobs.push(invoice.errors)
                        }
                    } else {
                        failedInvoice.push(invoice)
                        failedBlobs.push(invoice.errors)
                    }
                }

                console.log(successInvoice, 'Success Invoices')
                console.log(failedInvoice, 'Failed Invoices')
                console.log(blobs, 'Success Blobs')
                console.log(failedBlobs, 'Failed Blobs')

                try {
                    if (writer.length > 0 && files.length > 0) {

                        const csv = parse(writer);
                        await createTheFile(stringToStream(csv), csvFilePath)
                        files.push({url: csvFilePath, name: csvFileName});
                        const result = await this.ftpUpload(files, integrationDetails);
                        return this.updateBlob(result, successInvoice, failedInvoice, blobs, failedBlobs)

                    } else {
                        return this.updateBlob({
                            message : 'No Files to Upload to FTP'
                        }, successInvoice, failedInvoice, blobs, failedBlobs)
                    }
                } catch (e) {
                    console.log(e)
                    const error = {
                        message : 'Failed to Upload to FTP, Please Contact Admin'
                    }
                    await this.updateErrorBlog(allInvoice, error)
                }

            } else if (integrationDetails.Partner === 'WEX' ) {

                const files = [];
                const allInvoice = [];
                const successInvoice = [];
                const failedInvoice = [];
                const failedBlobs= [];

                for (const invoiceData of invoiceList){

                    const invoice = invoiceData.Payload.body
                    allInvoice.push(invoice)

                    if (invoiceData.Payload.statusCode === 200 && invoice.files.length > 0) {

                        const invoiceDocument = await this.awsHelper.generateInvoiceDocument(invoice.files[0], invoice)
                        if (invoiceDocument.url) {

                            successInvoice.push(invoice)
                            files.push({url: invoiceDocument.url, name: `${invoice.loadNumber}.pdf`})
                            const csvData: any = {
                                'AMOUNT': invoice.invoiceAmount,
                                'INV_DATE': invoice.invoicedDate ? moment(invoice.invoicedDate, moment.ISO_8601).format('MM/DD/YYYY') : moment().format('MM/DD/YYYY'),
                                'INV_ID': invoice.loadNumber,
                                'NAME': invoice.customerName,
                                'PO_NO': invoice.loadNumber,
                                'REFNO': invoice.refNumber
                            }
                            writer.push(csvData);
                            blobs.push(invoice.batchLog)

                        } else if (invoiceDocument.message){
                            const error = invoiceDocument.message;
                            invoice.errors.push({ invoice_Id: invoice.woInvoiceId, invoiceNumber: invoice.loadNumber, error });
                            failedInvoice.push(invoice)
                            failedBlobs.push(invoice.errors)
                        }
                    } else {
                        failedInvoice.push(invoice)
                        failedBlobs.push(invoice.errors)
                    }
                }

                console.log(successInvoice, 'Success Invoices')
                console.log(failedInvoice, 'Failed Invoices')
                console.log(blobs, 'Success Blobs')
                console.log(failedBlobs, 'Failed Blobs')

                try {
                    if (writer.length > 0 && files.length > 0) {

                        const csv = parse(writer);
                        await createTheFile(stringToStream(csv), csvFilePath)
                        files.push({url: csvFilePath, name: csvFileName});
                        const result = await this.sftpUpload(files, integrationDetails);
                        return this.updateBlob(result, successInvoice, failedInvoice, blobs, failedBlobs)

                    } else {
                        return this.updateBlob({
                            message : 'No Files to Upload to FTP'
                        }, successInvoice, failedInvoice, blobs, failedBlobs)
                    }
                } catch (e) {
                    console.log(e)
                    const error = {
                        message : 'Failed to Upload to FTP, Please Contact Admin'
                    }
                    await this.updateErrorBlog(allInvoice, error)
                }

            }

        } else {
            const error = {
                message : 'Company Not Integrated with factor'
            }
            return this.updateErrorBlogNotIntegrated(invoiceList[0], error)
        }
    }

    private async updateBlob(result: any, successInvoice: any, failedInvoices: any, successBlobs: any, failedBlobs: any): Promise<any> {

        const bLog = {} as any;
        if (successInvoice.length > 0) {

            bLog.details = JSON.stringify({blobs: successBlobs, failedBlobs});
            bLog.batchNumber = successInvoice[0].batchNumber;
            bLog.id = successInvoice[0].batchId;
            bLog.userId = successInvoice[0].userId;
            bLog.status = 'Success'
            await this.invoiceHelpers.insertFactorBatchLog(bLog);

        } else if (failedInvoices.length > 0) {

            bLog.details = JSON.stringify({blobs: successBlobs, failedBlobs});
            bLog.batchNumber = failedInvoices[0].batchNumber;
            bLog.id = failedInvoices[0].batchId;
            bLog.userId = failedInvoices[0].userId;
            bLog.status = 'Failure'
            await this.invoiceHelpers.insertFactorBatchLog(bLog);

        }

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
        return bLog
    }

    private async ftpUpload(files: any, ftpDetails: any): Promise<any> {

        const configs = {
            host: ftpDetails.Host,
            password: ftpDetails.Password,
            port: '21',
            secure: false,
            user: ftpDetails.UserName,
        } as any;

        console.log(configs, ' : FTP Config')
        console.log(files, ' : Files')

        const ftpClient = new ftp.Client(10000);

        return new Promise<void>((resolve, reject) => {
            ftpClient
                .access(configs)
                .then(async () => {
                    for (const file of files) {
                        if (ftpDetails.Partner === 'RTS') {
                            await ftpClient.uploadFrom(file.url, `/${file.name}`);
                        } else if (ftpDetails.Partner === 'Otr'){
                            await ftpClient.uploadFrom(file.url, `${ftpDetails.Directory}${file.name}`);
                        }
                    }
                })
                .then(() => {
                    return ftpClient.close();
                })
                .then(() => {
                    return resolve({ message: 'Files Uploaded Successfully' } as any);
                })
                .catch((error: Error) => {
                    console.log(error, ' : FTP Connection Error')
                    reject({ message: `Failed to Upload Files to RTS Please contact admin ${error}` });
                });
        });
    }

    private async sftpUpload(files: any, sftpDetails: any): Promise<any> {

        const configs = {
            algorithms: {
                serverHostKey: [
                    'ssh-rsa',
                    'ecdsa-sha2-nistp256',
                    'ecdsa-sha2-nistp384',
                    'ecdsa-sha2-nistp521',
                    'ssh-dss'
                ]
            },
            host: sftpDetails.Host,
            password: sftpDetails.Password,
            port: '22',
            readyTimeout: 10000,
            retries: 3,
            username: sftpDetails.UserName,
        }

        console.log(configs, ' : SFTP Config')
        console.log(sftpDetails.Directory, ' : File Directory')

        const sftp = new Client();
        return new Promise<void>((resolve, reject) => {
            sftp
                .connect(configs)
                .then(() => {
                    console.log('Connected to SFTP')
                    return Promise.all(files.map((file: any) => {
                        console.log(file.name, ' : File Name')
                        return sftp.put(file.url, `${sftpDetails.Directory}${file.name}`);
                    }))
                })
                .then(() => {
                    console.log('SFTP Connected Closed')
                    return sftp.end()
                })
                .then(() => {
                    return resolve({ message: 'Files Uploaded Successfully' } as any)
                })
                .catch((error: any) => {
                    console.log(error)
                    reject({ error })
                })
        });

    }

    private async updateErrorBlogNotIntegrated(invoice: any, error: any): Promise<any> {
        const bLog = {} as any;
        bLog.details = JSON.stringify({error});
        bLog.batchNumber = invoice.Payload.body.batchNumber;
        bLog.userId = invoice.Payload.body.userId;
        bLog.id = invoice.Payload.body.batchId;
        bLog.status = 'Failed'
        await this.invoiceHelpers.insertFactorBatchLog(bLog);
        return bLog
    }

    private async updateErrorBlog(invoice: any, error: any): Promise<any> {
        const bLog = {} as any;
        bLog.details = JSON.stringify({error});
        bLog.batchNumber = invoice[0].batchNumber;
        bLog.userId = invoice[0].userId;
        bLog.id = invoice[0].batchId;
        bLog.status = 'Failed'
        await this.invoiceHelpers.insertFactorBatchLog(bLog);
        return bLog
    }
}