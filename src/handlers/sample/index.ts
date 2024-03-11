import { ConfigService } from "../../services/config/config.service";
import { Database } from "../../services/database/database";

exports.handler = async function (event: any) {
	try {
		// Load configuration
		await ConfigService.loadConfig();

		// initialize database connection
		const db = new Database();
		const databaseName = await db.query('SELECT DATABASE();');

		return {
			isBase64Encoded: false,
			statusCode: 200,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				config: ConfigService.configs,
				database: databaseName.data
			}),
		};
	} catch(ex: any) {
		return {
			statusCode: 500,
			errors: [ex.message]
		};
	}
};
