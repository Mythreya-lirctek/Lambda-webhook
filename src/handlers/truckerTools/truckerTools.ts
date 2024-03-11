import {APIGatewayProxyEvent} from 'aws-lambda';
import {ConfigService} from '../../services/config/config.service';
import console from 'console';
import {TruckerTools} from '../../services/truckerTools/truckerTools';

exports.handler = async function (event: APIGatewayProxyEvent) {
    try {

        // Load configuration
        await ConfigService.loadConfig();
        const truckerTools = new TruckerTools();
        const req: any = event.body;
        const requestBody = JSON.parse(req) || {}
        await truckerTools.handleTruckerToolsResponse(requestBody);
        return { statusCode: 200 };

    } catch(ex: any) {
        console.log(ex, 'Error')
        return { statusCode: 500, body: ex.message };
    }
};