import { APIGatewayProxyEvent } from 'aws-lambda';
import moment = require("moment");
import {MacroPoint} from "../../services/macropoint/macropoint";
import { ConfigService } from '../../services/config/config.service';

exports.handler = async function (event: APIGatewayProxyEvent) {
    try {
		// Load configuration
		await ConfigService.loadConfig();
        const queryParams = event.queryStringParameters;
        const macroPoint = new MacroPoint()

        const macroPointId = queryParams?.MPOrderID ? queryParams.MPOrderID : null
        if (macroPointId !== null && queryParams) {
            const coId = await macroPoint.getCoId(macroPointId)
            const coRelayId = await macroPoint.getCoRelayId(macroPointId)
            const response = {
                coId : coId.data[0] ? (coId.data[0].Id ? coId.data[0].Id : null) : null,
                coRelayId : coRelayId.data[0] ? (coRelayId.data[0].Id ? coRelayId.data[0].Id : null) : null,
                createdAt: moment().utc().format('YYYY-MM-DD HH:mm:ss'),
                id: queryParams.ID ? queryParams.ID : null,
                isDeleted: 0,
                latitude: queryParams.Latitude ? queryParams.Latitude : null,
                locationAt: queryParams.LocationDateTimeUTC ? moment(queryParams.LocationDateTimeUTC).format('YYYY-MM-DD HH:mm:ss') : null,
                longitude: queryParams.Longitude ? queryParams.Longitude : null,
            }
            await macroPoint.addLocationUpdates(response)
        }

        return createResponse(200, { message : 'Locations Updated Successfully'})

    } catch(ex: any) {
        return createResponse(500, ex.message)
    }
};

function createResponse(statusCode: number, body: any) {
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    };
}