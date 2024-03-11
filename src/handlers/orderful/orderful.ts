import { APIGatewayProxyEvent } from 'aws-lambda';
import console from 'console';
import {OrderFulService} from '../../services/orderful/orderful';
import {ConfigService} from '../../services/config/config.service';

exports.handler = async function (event: APIGatewayProxyEvent) {
    try {

        await ConfigService.loadConfig();
        const orderFulService = new OrderFulService();
        const request: any = event.body;
        await orderFulService.handleOrderFulResponse(request);
        return { statusCode: 200 };

    } catch(ex: any) {
        console.log(ex)
        return {
            statusCode: 500,
            body: ex.message,
        };
    }
};