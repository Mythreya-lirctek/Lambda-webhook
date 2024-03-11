import { ConfigService } from '../../services/config/config.service';
import moment from 'moment';
import console from 'console';
import {ZipFile} from '../../services/invoiceDownloads/zipFile';

exports.zipFile = async function (invoice: any) {
    try {

        await ConfigService.loadConfig()
        const zipFile = new ZipFile();
        const invoiceResult = await zipFile.createZip(invoice.item);
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