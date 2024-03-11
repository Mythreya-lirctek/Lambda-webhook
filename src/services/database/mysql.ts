import { createPool, Pool } from 'mysql';
import { ConfigService } from '../config/config.service';

class MysqlConnection {
	public static getConnectionPool(): Pool {
		if (!MysqlConnection.connection) {
			const config = ConfigService.configs;
			const databaseConfig = config.database;
			MysqlConnection.connection = createPool({
				connectionLimit : databaseConfig.connectionLimit || 10,
				database: databaseConfig.database,
				host: databaseConfig.host,
				password: databaseConfig.password,
				user: databaseConfig.user
			});
		}
		return MysqlConnection.connection;
	}


	public static getReaderConnectionPool(): Pool {
		if (!MysqlConnection.readonlyConnection) {
			const config = ConfigService.configs;
			// fallback to the main connection if a reader is not specified.
			const readonlyDatabaseConfig = config.readerDatabase || config.database;
			
			MysqlConnection.readonlyConnection = createPool({
				connectionLimit : readonlyDatabaseConfig.connectionLimit || 10,
				database: readonlyDatabaseConfig.database,
				host: readonlyDatabaseConfig.host,
				password: readonlyDatabaseConfig.password,
				user: readonlyDatabaseConfig.user
			});
		}
		return MysqlConnection.readonlyConnection;
	}
	private static connection: Pool;
	private static readonlyConnection: Pool;

	private constructor() {}
}

export default MysqlConnection;