import { ConfigService } from '../../../services/config/config.service';
import { Nylas } from '../../../services/nylas/nylas';
import { APIGatewayProxyEvent } from 'aws-lambda';
import console from "console";

exports.handler = async function (event: any) {
    try {
		// Load configuration
		await ConfigService.loadConfig();
        const nylas = new Nylas()
        for (const data of event.Records){
            const requestBody = data.body;
            const request = JSON.parse(requestBody) || {};
            console.log(request)
            const response: any = await nylas.handleResponseData(request)
            console.log(response, 'Response')
        }
        return { statusCode: 200 };


    } catch(ex: any) {
        console.log(ex, 'Error')
        return { statusCode: 500, body: ex.message };
    }
};