import { Database } from '../database/database';
import console from "console";
import {ConfigService} from "../config/config.service";
import axios, {AxiosInstance} from 'axios';
import {promise} from "aws-crt";

export class Nylas{

    private dataBase: Database;
    private dataBaseGet: Database;
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: ConfigService.configs.nylas.baseUrl
        });
        this.dataBase = new Database();
        this.dataBaseGet = new Database(true);
    }

    public async handleResponseData(request: any): Promise<any> {

        const requestBody = JSON.parse(request) || {};
        const deltas = requestBody.deltas as any
        console.log(deltas, 'deltas')

        const response = [] as any;
        for (const record of deltas) {

            console.log(record, 'Record')
            console.log(record.type)

            if (record.object === 'account'
                && record.type
                && record.object_data
                && record.object_data.account_id){

                const req: any = {};
                req.accountId = record.object_data.account_id;

                const emailAccount = await this.getAccountThroughAccountId(req.accountId);
                console.log(emailAccount, 'Email Account')

                if (emailAccount.data
                    && emailAccount.data.length > 0) {

                    console.log('Email Account Exists')

                    if (record.type === 'account.stopped') {
                        req.accountConnected = 0
                        req.accountRunning = 0
                        req.accountStopped = 1
                        req.accountInvalid = 0
                        req.accountSyncError = 0
                    } else if (record.type === 'account.connected') {
                        req.accountConnected = 1
                        req.accountRunning = 0
                        req.accountStopped = 0
                        req.accountInvalid = 0
                        req.accountSyncError = 0
                    } else if (record.type === 'account.running') {
                        req.accountConnected = 1
                        req.accountRunning = 1
                        req.accountStopped = 0
                        req.accountInvalid = 0
                        req.accountSyncError = 0
                    } else if (record.type === 'account.invalid') {
                        req.accountConnected = 0
                        req.accountRunning = 0
                        req.accountStopped = 0
                        req.accountInvalid = 1
                        req.accountSyncError = 0
                    } else if (record.type === 'account.sync_error') {
                        req.accountConnected = 0
                        req.accountRunning = 0
                        req.accountStopped = 0
                        req.accountInvalid = 0
                        req.accountSyncError = 1
                    }

                    console.log(req, 'REQ')
                    await this.insertEmailAccounts(req)
                    response.push(req)
                }

            }

            else if (record.type === 'message.updated'
                && record.object_data) {

                const messageId = record.object_data.id
                const emailMessage = await this.getMessageThroughMessageId(messageId);
                console.log(emailMessage, 'Email Message')

                if (emailMessage.data
                    && emailMessage.data.length > 0) {
                    const req = {
                        accountId: record.object_data.account_id,
                        messageId: messageId,
                        messageUpdated: 1,
                        threadId: record.object_data.attributes ? record.object_data.attributes.thread_id ? record.object_data.attributes.thread_id : null : null
                    }

                    console.log(req, 'REQ')
                    await this.insertEmailMessage(req)
                    response.push(req)
                } else {
                    response.push({})
                }

            }

            else if (record.type === 'message.opened' && record.object_data) {

                const messageId = record.object_data.metadata.message_id
                const emailMessage = await this.getMessageThroughMessageId(messageId);
                console.log(emailMessage, 'Email Message')

                if (emailMessage.data
                    && emailMessage.data.length > 0) {
                    const req = {
                        accountId: record.object_data.account_id,
                        messageId: messageId,
                        messageOpened: 1
                    }
                    console.log(req, 'REQ')
                    await this.insertEmailMessage(req)
                    response.push(req)
                } else {
                    response.push({})
                }

            }

            else if (record.type === 'message.link_clicked' && record.object_data) {

                const messageId = record.object_data.metadata.message_id
                const emailMessage = await this.getMessageThroughMessageId(messageId);
                console.log(emailMessage, 'Email Message')

                if (emailMessage.data
                    && emailMessage.data.length > 0) {

                    const req = {
                        accountId: record.object_data.account_id,
                        messageId: messageId,
                        messageLinkClicked: 1
                    }
                    console.log(req, 'REQ')
                    await this.insertEmailMessage(req)
                    response.push(req)
                } else {
                    response.push({})
                }

            }

            else if (record.type === 'thread.replied' && record.object_data) {

                const req = {
                    accountId : record.object_data.account_id,
                    messageId : record.object_data.metadata ? record.object_data.metadata.message_id ? record.object_data.metadata.message_id : null : null,
                    replayMessageId: record.object_data.metadata ? record.object_data.metadata.reply_to_message_id ? record.object_data.metadata.reply_to_message_id : null : null,
                    threadId : record.object_data.metadata ? record.object_data.metadata.thread_id ? record.object_data.metadata.thread_id : null : null,
                    threadReplied : 1
                }
                console.log(req, 'REQ')
                await this.insertEmailMessage(req)
                response.push(req)

            }

            else if (record.type === 'message.created'
                && record.object_data
                && record.object_data.id) {

                const messageId = record.object_data.id

                const emailMessage = await this.getMessageThroughMessageId(messageId);
                console.log(emailMessage, 'Email Message')

                if (emailMessage.data
                    && emailMessage.data.length > 0) {

                    const req = {
                        accountId : record.object_data.account_id,
                        messageId : messageId,
                        messageCreated : 1,
                        threadId : record.object_data.attributes ? record.object_data.attributes.thread_id ? record.object_data.attributes.thread_id : null : null
                    }

                    console.log(req, 'REQ')
                    await this.insertEmailMessage(req)
                    response.push(req)

                } else {

                    const messageId = record.object_data.id;
                    const threadId = record.object_data.attributes.thread_id;
                    const accountId = record.object_data.account_id;

                    const workOrderId = await this.getWorkOrderIdThroughThreadId(threadId)
                    console.log(workOrderId, 'Email Message 2')

                    if (workOrderId.data
                        && workOrderId.data.length > 0
                        && workOrderId.data[0].WorkOrder_Id !== null ) {

                        const req = {
                            accountId : record.object_data.account_id,
                            messageId : messageId,
                            messageCreated : 1,
                            threadId : threadId,
                            workOrderId: workOrderId.data[0].WorkOrder_Id,
                            isSent: 0
                        }

                        console.log(req, 'REQ')
                        await this.insertEmailMessage(req)
                        response.push(req)

                    } else {

                        const workOrderId = await this.getWorkorderId(messageId, accountId)
                        if (workOrderId !== null){
                            const req = {
                                accountId : record.object_data.account_id,
                                messageId : messageId,
                                messageCreated : 1,
                                threadId : threadId,
                                workOrderId: workOrderId,
                                isSent: 0
                            }

                            console.log(req, 'REQ')
                            await this.insertEmailMessage(req)
                            response.push(req)
                        } else {
                            response.push({})
                        }

                    }

                }

            } else {
                response.push({})
            }
        }

        return response

    }

    public async insertEmailAccounts(req: any): Promise<any> {
        return this.dataBase.query(`
			CALL addemailaccount_snew(
				${req.accessToken ? this.dataBase.connection.escape(req.accessToken) : null},
				${req.accountId ? this.dataBase.connection.escape(req.accountId) : null},
				${req.email ? this.dataBase.connection.escape(req.email) : null},
				UTC_TIMESTAMP,
				UTC_TIMESTAMP,
				${null},
				${null},
				${req.accountConnected},
				${req.accountRunning},
				${req.accountStopped},
				${req.accountInvalid},
				${req.accountSyncError},
				${null},
				${null},
				${null},
				${null}
			)
		`);
    }

    private async getMessageThroughMessageId(messageId: any): Promise<any>{
        return this.dataBaseGet.query(`
				SELECT 
				    * 
				FROM 
				    emailmessage 
				WHERE 
				    MessageId = ${this.dataBase.connection.escape(messageId)}
	    `)
    }

    private async getWorkOrderIdThroughThreadId(threadId: any): Promise<any>{
        return this.dataBaseGet.query(`
				SELECT 
				    WorkOrder_Id 
				FROM 
				    emailmessage 
				WHERE 
				    ThreadId = ${this.dataBase.connection.escape(threadId)}
	    `)
    }

    private async getAccountThroughAccountId(accountId: any): Promise<any>{
        return this.dataBaseGet.query(`
				SELECT 
				    * 
				FROM 
				    emailaccount 
				WHERE 
				    AccountId = ${this.dataBase.connection.escape(accountId)}
	    `)
    }

    public async insertEmailMessage(req: any) {
        return this.dataBase.query(`
			CALL addemailmessage_snew(
				${req.accountId ? this.dataBase.connection.escape(req.accountId) : null},
				${req.threadId ? this.dataBase.connection.escape(req.threadId) : null},
				${req.messageId ? this.dataBase.connection.escape(req.messageId) : null},
				UTC_TIMESTAMP,
				UTC_TIMESTAMP,
				${null},
				${null},
				${req.messageCreated ? req.messageCreated : null},
				${req.messageOpened ? req.messageOpened : null},
				${req.messageLinkClicked ? req.messageLinkClicked : null},
				${req.messageUpdated ? req.messageUpdated : null},
				${req.threadReplied ? req.threadReplied : null},
				${req.workOrderId ? req.workOrderId : null},
				${null},
				${req.replayMessageId ? req.replayMessageId : null},
				${req.isSent ? req.isSent : 1}
			)
		`)
    }

    public async getAccessTokenFromAccountId(accountId: any): Promise<any>{
        return this.dataBaseGet.query(`
				SELECT 
				    AccessToken
				FROM 
				    emailaccount 
				WHERE 
				    AccountId = ${this.dataBase.connection.escape(accountId)}
	    `)
    }

    private async getWorkorderId(messageId: any, accountId: any): Promise<any> {
        try {
            const accessToken = await this.getAccessTokenFromAccountId(accountId);
            console.log(accessToken, 'ACCESS TOKEN');

            if (accessToken.data
                && accessToken.data.length > 0
                && accessToken.data[0].AccessToken !== null ) {

                const message = await this.getMessageById(messageId, accessToken.data[0].AccessToken)
                console.log(message, 'MESSAGE_BY_MESSAGE_ID');

                if (message.data
                    && message.data.subject){

                    const referenceNo = await this.getNo(message.data.subject);
                    console.log(referenceNo)

                    if (referenceNo !== null){
                        const workOrderId: any = await this.getWOrkOrderIdByLoadNoReferenceNo(null, referenceNo);
                        if (workOrderId.data
                            && workOrderId.data.length > 0
                            && workOrderId.data[0]
                            && workOrderId.data[0][0]
                            && workOrderId.data[0][0].id) {
                            return workOrderId.data[0][0].id;
                        } else {
                            const workOrderId: any = await this.getWOrkOrderIdByLoadNoReferenceNo(referenceNo, null);
                            if (workOrderId.data
                                && workOrderId.data.length > 0
                                && workOrderId.data[0]
                                && workOrderId.data[0][0]
                                && workOrderId.data[0][0].id) {
                                return workOrderId.data[0][0].id;
                            } else {
                                return null;
                            }
                        }
                    } else {
                        return null;
                    }
                } else {
                    return null;
                }

            } else {
                return null;
            }
        } catch (e) {
            console.log(e, 'GET WORK_ORDER_ID ERROR');
            return null;
        }
    }

    public async getWOrkOrderIdByLoadNoReferenceNo(loadNo: any, referenceNo: any) {
        return this.dataBase.query(`
			CALL getWOrkOrderIdByLoadNoReferenceNo_snew(
				${loadNo ? this.dataBase.connection.escape(loadNo) : null},
				${referenceNo ? this.dataBase.connection.escape(referenceNo) : null}
			)
		`)
    }

    private async getNo(subject: any): Promise<any>{
        const regex = /(\d+)/g;
        const val = subject.match(regex);
        if(val != null && val.length > 0){
            return val[0];
        } else {
            return null;
        }
    }

    private async getLoadNo(subject: any): Promise<any>{
        const regex = /(\d+)/g;
        const val = subject.match(regex);
        if(val != null && val.length > 0){
            return val[0];
        } else {
            return null;
        }
    }

    public async getMessageById(messageId: any, accessToken: any): Promise<any> {
        return this.client.get(`/messages/${messageId}`, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization' : `Bearer ${accessToken}`
            }
        });
    }
}