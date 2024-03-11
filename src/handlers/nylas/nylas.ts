import { ConfigService } from '../../services/config/config.service';
import { APIGatewayProxyEvent } from 'aws-lambda';
import console from 'console';
import AWS from 'aws-sdk';

exports.handler = async function (event: APIGatewayProxyEvent) {
    try {
		// Load configuration
		await ConfigService.loadConfig();

        const httpMethod = event.httpMethod;
        const queryParams = event.queryStringParameters;

        const sqs = new AWS.SQS({ region: 'us-east-1' })

        if (httpMethod === 'GET') {
            return createResponse(200, queryParams?.challenge)
        } else if (httpMethod === 'POST'){
            const requestBody = event.body
            console.log(requestBody)
            const s3 = new AWS.SQS();
            const params = {
                MessageBody: JSON.stringify(requestBody),
                QueueUrl: 'https://sqs.us-west-2.amazonaws.com/489119502650/nylas'
            };
            await sqs.sendMessage(params).promise();
            return { statusCode: 200 };
        } else {
            return { statusCode: 200 };
        }

    } catch(ex: any) {
        return createResponse(500, ex.message)
    }
};

function createResponse(statusCode: number, body: any) {
    return {
        statusCode: statusCode,
        body: body,
    };
}