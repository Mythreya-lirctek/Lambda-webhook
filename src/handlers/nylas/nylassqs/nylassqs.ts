import { ConfigService } from '../../../services/config/config.service';
import { Nylas } from '../../../services/nylas/nylas';
import { APIGatewayProxyEvent } from 'aws-lambda';
import console from "console";

exports.handler = async function (event: APIGatewayProxyEvent) {
    try {
		// Load configuration
		await ConfigService.loadConfig();
        const nylas = new Nylas()
        const requestBody: any = event.body
        console.log(requestBody)
        const response: any = await nylas.handleResponseData(requestBody)
        console.log(response, 'Response')
        return { statusCode: 200 };

    } catch(ex: any) {
        console.log(ex, 'Error')
        return { statusCode: 500, body: ex.message };
    }
};