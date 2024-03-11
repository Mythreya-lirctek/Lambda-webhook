import { ConfigService } from '../../services/config/config.service';
import { FactorIntegration } from '../../services/invoices/factorIntegration';
import moment from 'moment/moment';
import console from 'console';

exports.factorIntegration = async function (invoices: any) {
    try {

        await ConfigService.loadConfig()
        const factorIntegration = new FactorIntegration();
        const response = await factorIntegration.sendToFactor(invoices.item)
        return { statusCode : 200, body : response }

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