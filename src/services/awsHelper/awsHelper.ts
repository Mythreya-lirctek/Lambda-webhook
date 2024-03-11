import AWS from 'aws-sdk';
import {ConfigService} from '../config/config.service';
import path from 'path';
import {createTheFile} from '../../utils/file.util';
import fs from 'fs';
import console from 'console';
import {PDFDocument} from 'pdf-lib';
import axios, {AxiosInstance} from 'axios';

export class AwsHelper {

    private client: AxiosInstance;

    constructor() {
        AWS.config.update({
            accessKeyId: ConfigService.configs.aws.AWSAccessKeyId,
            secretAccessKey: ConfigService.configs.aws.secretKey
        });
        this.client = axios.create({
            baseURL: 'https://dev-api-service.taraiwa.com'
        });
    }

    public async uploadToS3(invoice: any, htmlResult: any): Promise<any> {

        const tempDirectory = '/tmp';
        const fileName = `Invoice-${invoice.workOrderId}.pdf`;
        const filePath = path.join(tempDirectory, fileName);
        await createTheFile(htmlResult, filePath)

        console.log(fileName, 'FIle Name')
        console.log(filePath, 'FIle Path')
        const key = `company/${invoice.companyId}/workOrder/${invoice.workOrderId}/${fileName}`;

        console.log(key, 'key')
        const fileContent = fs.readFileSync(filePath);
        const s3 = new AWS.S3();
        const params = {
            Bucket: ConfigService.configs.aws.bucket,
            Key: key,
            secretAccessKey: ConfigService.configs.aws.secretKey,
            Body: fileContent
        };

        try {
            await s3.upload(params).promise();
            console.log(key, ' : Invoice AWS File Path')
            return { key }
        } catch (e: any) {
            console.log(e, ' : Uploading Failed')
            return { message : 'Failed to Upload the Document. Please Contact Admin'}
        }



    }

    public async getDocumentMergeAndPush(files: any, invoice: any): Promise<any> {

        const request = {
            files,
            invoice
        }

        const s3 = new AWS.S3();

        const pdfDoc = await PDFDocument.create();
        const sourceObjectKeys = files.map((file: any) => file.url);

        const bucketName = ConfigService.configs.aws.bucket;
        try {

            if (files.files === 1){
                console.log(sourceObjectKeys[0], ' : Invoice Aws Path as it contains Only 1')
                return {mergedUrl: sourceObjectKeys[0]}

            } else {

                console.log('Started Merging Process')
                for (const key of sourceObjectKeys) {

                    const params = {
                        Bucket: bucketName,
                        Key: key
                    }
                    const response = await s3.getObject(params).promise();
                    const pdfBytes: any = response.Body;

                    const externalPdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
                    const pageCount = externalPdfDoc.getPageCount();

                    for (let i = 0; i < pageCount; i++) {
                        const [copiedPage] = await pdfDoc.copyPages(externalPdfDoc, [i]);
                        pdfDoc.addPage(copiedPage);
                    }
                }

                const mergedKey = `company/${invoice.companyId}/workOrder/${invoice.workOrderId}/Invoice-${invoice.woInvoiceId}-${invoice.workOrderId}.pdf`;
                const mergedPdfBytes = await pdfDoc.save();
                await s3.putObject({Bucket: bucketName, Key: mergedKey, Body: mergedPdfBytes}).promise();
                console.log(mergedKey, ' : Merged Document AWS Path')
                return { mergedUrl: mergedKey }
            }

        } catch (e: any) {

            try {
                const resp = await this.getMergedUrl(request)
                console.log(resp)
                if (resp.data && resp.data.mergedUrl){
                    return { mergedUrl: resp.data.mergedUrl }
                } else {
                    console.log(e, ' : Merging Process Failed')
                    return { message : 'Failed to merge the Document. Please Contact Admin'}
                }
            } catch (e: any) {
                console.log(e, ' : Merging Process Failed')
                return { message : 'Failed to merge the Document. Please Contact Admin'}
            }

        }

    }

    public async getMergedUrl(request: any): Promise<any> {
        return this.client.post(`/workorder/api/stepfunction/getMergedUrl`, request, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
    }

    public async getDocument(singleFile: any, invoice: any): Promise<any> {

        const s3 = new AWS.S3();
        const bucketName = ConfigService.configs.aws.bucket;

        const tempDirectory = '/tmp';
        const fileName = `${singleFile.name}_${invoice.loadNumber}.pdf`;
        const filePath = path.join(tempDirectory, fileName);
        try {
            const res: any = await s3.getObject({Bucket: bucketName, Key: singleFile.url}).promise();
            fs.writeFileSync(filePath, res.Body);
            return {url: filePath, name: fileName}
        }  catch (e: any) {
            console.log(e, ' : Get Document Failed')
            return { message : 'Failed to Get Document. Please Contact Admin'}
        }

    }

    public async generateInvoiceDocument(url: any, invoice: any): Promise<any> {

        const s3 = new AWS.S3();

        const bucketName = ConfigService.configs.aws.bucket;

        try {

            const tempDirectory = '/tmp';
            const fileName = `${invoice.loadNumber}.pdf`;
            const filePath = path.join(tempDirectory, fileName);
            const res: any = await s3.getObject({Bucket: bucketName, Key: url}).promise();
            fs.writeFileSync(filePath, res.Body);
            return { url : filePath}

        } catch (e) {
            console.log(e, 'Failed Getting Merged Dcument')
            return { message : 'Failed Getting Merged Document. Please Contact Admin'}
        }

    }
}