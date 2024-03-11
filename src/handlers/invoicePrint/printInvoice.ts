import {ConfigService} from '../../services/config/config.service';
import console from 'console';
import moment from 'moment/moment';
import {PrintInvoice} from '../../services/invoicePrint/printInvoice';

exports.printInvoice = async function (request: any) {
    try {

        await ConfigService.loadConfig()
        const printInvoice = new PrintInvoice();
        const response = await printInvoice.printAllInvoices(request.item);
        return createResponse(200, response)

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