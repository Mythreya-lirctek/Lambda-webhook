import {APIGatewayProxyEvent} from 'aws-lambda';
import {ConfigService} from '../../services/config/config.service';
import {RelayPayments} from '../../services/relayPayments/relayPayments';
import console from 'console';

exports.handler = async function (event: APIGatewayProxyEvent) {
    try {

        // Load configuration
        await ConfigService.loadConfig();
        const relayPayments = new RelayPayments();
        const requestBody:any = event.body;
        console.log(requestBody, 'Request')
        await relayPayments.handleRelayPaymentsResponse(requestBody);
        return { statusCode: 200 };

    } catch(ex: any) {
        console.log(ex, 'Error')
        return { statusCode: 500, body: ex.message };
    }
};