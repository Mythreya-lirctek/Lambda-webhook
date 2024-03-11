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
import AdmZip from 'adm-zip';
import axios, {AxiosInstance} from 'axios';

export class FactorIntegration {

    private dataBaseGet: Database;
    private invoiceHelpers: InvoiceHelpers;
    private awsHelper: AwsHelper;
    private client: AxiosInstance;

    constructor() {
        this.dataBaseGet = new Database(true);
        this.invoiceHelpers = new InvoiceHelpers();
        this.awsHelper = new AwsHelper();

        AWS.config.update({
            accessKeyId: ConfigService.configs.aws.AWSAccessKeyId,
            secretAccessKey: ConfigService.configs.aws.secretKey
        });

        this.client = axios.create({
            baseURL: 'https://dev-api-service.taraiwa.com'
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

            const blobs: any = [];
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

                const invoices: any = [];

                const allInvoice: any = [];

                const successInvoice: any = [];
                const failedInvoice: any = [];
                const failedBlobs: any= [];

                await Promise.all(
                    invoiceList.map(async (invoiceData: any) => {
                        const invoice = invoiceData.Payload.body
                        allInvoice.push(invoice)

                        if (invoiceData.Payload.statusCode === 200 && invoice.files.length > 0) {
                            invoices.push(invoice)
                        } else {
                            failedInvoice.push(invoice)
                            failedBlobs.push(invoice.errors)
                        }
                    })
                )

                try {

                    const request = {
                        integration: {
                            "Partner": integrationDetails.Partner,
                            "UserName": integrationDetails.UserName,
                            "Password": integrationDetails.Password,
                            "Host": integrationDetails.Host,
                            "Directory": integrationDetails.Directory
                        },
                        invoices
                    }

                    const response = await this.sendFilesToTriumph(request)
                    if (response.data){
                        await Promise.all(
                            response.data.failedInvoice.map(async (inv: any) => {
                                failedInvoice.push(inv)
                            })
                        )
                        await Promise.all(
                            response.data.failedBlobs.map(async (inv: any) => {
                                failedBlobs.push(inv)
                            })
                        )
                    }
                    if (response.data.success){
                        return this.updateBlob({ message: 'Files Uploaded Successfully' }, response.data.successInvoice, failedInvoice, response.data.successBlobs, failedBlobs)
                    } else if (response.data.message){
                        return this.updateBlob({ message: 'Failed to Upload to SFTP' }, response.data.successInvoice, failedInvoice, response.data.successBlobs, failedBlobs)
                    }  else if (response.data.error){
                        return this.updateBlob({ message: 'Failed to Upload to SFTP' }, successInvoice, allInvoice, blobs, failedBlobs)
                    } else {
                        return this.updateBlob({ message: 'Failed to Upload to SFTP' }, successInvoice, allInvoice, blobs, failedBlobs)
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
                const awsFiles = [];
                const allInvoice = [];
                const successInvoice = [];
                const failedInvoice = [];
                const failedBlobs= [];

                for (const invoiceData of invoiceList){

                    const invoice = invoiceData.Payload.body
                    allInvoice.push(invoice)

                    console.log(invoice.files)

                    if (invoiceData.Payload.statusCode === 200 && invoice.files.length > 0) {

                        awsFiles.push({ url : invoice.files[0], name: `${invoice.loadNumber}.pdf` })
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

                try {
                    if (writer.length > 0 && files.length > 0) {

                        const tempDirectory = '/tmp';
                        const fileName = `${moment().format('MMDDYYYYhhmma')}.zip`;
                        const filePath = path.join(tempDirectory, fileName);

                        const newFiles = [];
                        const csv = parse(writer);
                        await createTheFile(stringToStream(csv), csvFilePath)

                        console.log(awsFiles)
                        const invoiceDocument = await this.awsHelper.getDocumentMergeAndPush(awsFiles, allInvoice[0])
                        if (invoiceDocument.mergedUrl){
                            const localMergedUrl = await this.awsHelper.getDocument({ url : invoiceDocument.mergedUrl, name: 'Invoice'},
                                { loadNumber : `${moment().format('MMDDYYYYhhmma')}`})
                            if (localMergedUrl.url) {
                                const zip = new AdmZip();
                                zip.addLocalFile(localMergedUrl.url);
                                zip.addLocalFile(csvFilePath);
                                zip.writeZip(filePath)

                                newFiles.push({url: filePath, name: fileName});
                                const result = await this.sftpUpload(newFiles, integrationDetails);
                                return this.updateBlob(result, successInvoice, failedInvoice, blobs, failedBlobs)

                            } else {
                                const error = {
                                    message : 'Failed to Upload to SFTP, Please Contact Admin'
                                }
                                await this.updateErrorBlog(allInvoice, error)
                            }
                        } else {
                            const error = {
                                message : 'Failed to Upload to SFTP, Please Contact Admin'
                            }
                            await this.updateErrorBlog(allInvoice, error)
                        }

                    } else {
                        return this.updateBlob({
                            message : 'No Files to Upload to SFTP'
                        }, successInvoice, failedInvoice, blobs, failedBlobs)
                    }
                } catch (e) {
                    console.log(e)
                    const error = {
                        message : 'Failed to Upload to SFTP, Please Contact Admin'
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
                    return reject({ message: `Failed to Upload Files to RTS Please contact admin ${error}` });
                });
        });
    }

    private async sftpUpload(files: any, sftpDetails: any): Promise<any> {

        console.log(files)
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

        const sftp = new Client();
        return new Promise<void>((resolve, reject) => {
            sftp
                .connect(configs)
                .then(async () => {
                    for (const file of files) {
                        console.log(file)
                        await sftp.put(file.url, `${sftpDetails.Directory}${file.name}`);
                    }
                })
                .then(() => {
                    console.log('SFTP Connected Closed')
                    return sftp.end()
                })
                .then(() => {
                    return resolve({ message: 'Files Uploaded Successfully' } as any)
                })
                .catch((error: any) => {
                    console.log(error, ' : FTP Connection Error')
                    return reject(error)
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

    public async sendFilesToTriumph(request: any): Promise<any> {
        return this.client.post(`/workorder/api/stepfunction/sendFilesToTriumph`, request, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
    }
}