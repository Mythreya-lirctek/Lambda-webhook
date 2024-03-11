import { ConfigService } from '../../services/config/config.service';
import { CreateInvoices } from '../../services/invoices/createInvoices';
import moment from 'moment';
import console from 'console';

exports.createInvoice = async function (invoice: any) {
    try {

        await ConfigService.loadConfig()
        const bulkInvoice = new CreateInvoices();
        const invoiceResult = await bulkInvoice.getContainerDocumentsForInvoicesAndMerge(invoice);
        return createResponse(200, invoiceResult)

    } catch(ex: any) {
        console.log(ex, ' : Error')
        console.log(invoice)
        return createResponse(500, invoice)
    }

};

function createResponse(statusCode: number, body: any) {
    return {
        statusCode: statusCode,
        body: body,
    };
}