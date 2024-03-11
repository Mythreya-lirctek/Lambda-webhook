import {ConfigService} from '../../services/config/config.service';
import console from 'console';
import moment from 'moment/moment';
import {SendEmail} from '../../services/invoiceEmails/sendEmail';

exports.sendEmail = async function (request: any) {
    try {

        await ConfigService.loadConfig()
        const sendEmail = new SendEmail();
        const invoiceResult = await sendEmail.processDocumentsAndSendEmail(request.item);
        return createResponse(200, invoiceResult)

    } catch(ex: any) {
        console.log(ex, ' : Error')
        return createResponse(500, ex)
    }

};

function createResponse(statusCode: number, body: any) {
    return {
        statusCode: statusCode,
        body: body,
    };
}