import {Database} from "../database/database";
import AWS from "aws-sdk";
import {ConfigService} from "../config/config.service";
import moment from 'moment';
import console from "console";

export class RelayPayments {

    private dataBase: Database;
    private dataBaseGet: Database;

    constructor() {
        this.dataBase = new Database();
        this.dataBaseGet = new Database(true);

        AWS.config.update({
            accessKeyId: ConfigService.configs.aws.AWSAccessKeyId,
            secretAccessKey: ConfigService.configs.aws.secretKey
        });
    }

    public async handleRelayPaymentsResponse(req: any): Promise<any> {

        const requestBody = JSON.parse(req) || {}

        const category = requestBody.category;
        const entity = requestBody.entity;

        if (category === 'charge_receipt') {
            const request = {} as any;
            request.fee = requestBody.fee/100;
            request.processedAmount = requestBody.amount/100;
            request.trackingNumber = requestBody.code_id;

            const fcIssueLogData = await this.getFcIssueLogByTrackingId(requestBody.code_id);
            console.log(fcIssueLogData.data[0])
            if (fcIssueLogData.data && fcIssueLogData.data[0]){
                request.id = fcIssueLogData.data[0].id
                const workOrderId = fcIssueLogData.data[0].WorkOrder_Id;
                const doId = fcIssueLogData.data[0].Type_Id;
                const companyId = fcIssueLogData.data[0].Company_Id;

                const binaryData = Buffer.from(requestBody.receipt_content, 'base64');

                const fileName = `${moment().unix()}-Receipt.pdf`
                const key = `company/${companyId}/workOrder/${workOrderId}/${fileName}`;

                const s3 = new AWS.S3();
                const bucketName = ConfigService.configs.aws.bucket;

                const params = {
                    Bucket: bucketName,
                    Key: key,
                    Body: binaryData, // The PDF content as a Buffer
                };
                console.log(params)

                try {
                    await s3.upload(params).promise();

                    const addContainerDocumentRequest: any = {
                        addToInvoice:1,
                        fileName: fileName,
                        url: key,
                        doId: doId,
                        containerName: 'workorder',
                        containerId: workOrderId
                    };

                    console.log(addContainerDocumentRequest, 'Request')
                    console.log(key, ' : Invoice AWS File Path')
                    await this.updateFcIssueLogs(request)
                    await this.addDocument(addContainerDocumentRequest)
                    return;
                } catch (error) {
                    console.log(error, ' : Invoice File Upload to AWS Failed')
                    return;
                }

            } else {
                return;
            }


        } else if (category === 'generic') {
            const request = {} as any;
            const status = entity.status;
            request.fee = entity.fee;
            request.trackingNumber = entity.code_id;
            request.processedAmount = entity.amount
            if (status === 'active'){
                request.status = 1;
            } else if (status === 'approved'){
                request.status = 4;
            } else {
                request.status = 3;
            }

            const fcIssueLogData = await this.getFcIssueLogByTrackingId(entity.code_id);
            if (fcIssueLogData.data && fcIssueLogData.data[0]){
                request.id = fcIssueLogData.data[0].id
            }
            await this.updateFcIssueLog(request)
            return;
        }

    }

    private async addDocument(req: any): Promise<any> {
        return this.dataBase.query(`
            INSERT INTO document(containerId,
                                 containerName,
                                 url,
                                 createdAt,
                                 fileName,
                                 showToDriver,
                                 addToInvoice)
            VALUES (
                    ${req.containerId},
                    ${req.containerName ? this.dataBase.connection.escape(req.containerName) : null},
                    ${req.url ? this.dataBase.connection.escape(req.url) : null},
                    UTC_TIMESTAMP,
                    ${req.fileName ? this.dataBase.connection.escape(req.fileName) : null},
                    ${req.showToDriver ? req.showToDriver : 0},
                    ${req.addToInvoice ? req.addToInvoice : 0})
		`);
    }

    private async updateFcIssueLog(request: any): Promise<any> {
        let text = '';
        const driverFields: any = ['status', 'updatedAt', 'trackingNumber', 'fee', 'processedAmount'];
        Object.keys(request).map((key) => {
            if (driverFields.indexOf(key) > -1) {
                if (typeof request[key] === 'string') {
                    // tslint:disable-next-line: prefer-template
                    text += key + `=${this.dataBase.connection.escape(request[key])},`;
                } else {
                    // tslint:disable-next-line: prefer-template
                    text += key + '=' + `${request[key]}` + ',';
                }
            }
        });
        if (text && request.id) {
            text += ` UpdatedAt = UTC_TIMESTAMP, ExecutionEndTime = UTC_TIMESTAMP`;
            return this.dataBase.query(`
                UPDATE
                    fcissuelog
                SET
                    ${text}
                WHERE
                    Id = ${request.id}
            `);
        } else {
            return null
        }
    }

    private async updateFcIssueLogs(request: any): Promise<any> {
        let text = '';
        const driverFields: any = ['updatedAt', 'trackingNumber', 'fee', 'processedAmount'];
        Object.keys(request).map((key) => {
            if (driverFields.indexOf(key) > -1) {
                if (typeof request[key] === 'string') {
                    // tslint:disable-next-line: prefer-template
                    text += key + `=${this.dataBase.connection.escape(request[key])},`;
                } else {
                    // tslint:disable-next-line: prefer-template
                    text += key + '=' + `${request[key]}` + ',';
                }
            }
        });
        if (text && request.id) {
            text += ` UpdatedAt = UTC_TIMESTAMP, ExecutionEndTime = UTC_TIMESTAMP`;
            return this.dataBase.query(`
                UPDATE
                    fcissuelog
                SET
                    ${text}
                WHERE
                    Id = ${request.id}
            `);
        } else {
            return null
        }
    }

    private async getFcIssueLogByTrackingId(trackingNumber: any): Promise<any> {
        return this.dataBaseGet.query(`
			SELECT 
				*
			FROM
				fcissuelog
			WHERE
				TrackingNumber = ${this.dataBase.connection.escape(trackingNumber)}
		`);
    }
}