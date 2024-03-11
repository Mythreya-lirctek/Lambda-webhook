import MysqlConnection from './mysql';
import { Pool, format, MysqlError } from 'mysql';
import DatabaseInterface, { DatabaseResponse } from './database.interface';

export class Database implements DatabaseInterface {
	public connection: Pool;
	constructor(readonly: boolean = false) {
		// use the singleton connection pools
		this.connection = readonly ? MysqlConnection.getReaderConnectionPool() : MysqlConnection.getConnectionPool();
	}

	public closeConnection(): Promise<any> {
		return new Promise((resolve, reject) => {
			if (!this.connection) {
				return resolve('');
			}
			this.connection.end((err: MysqlError) => {
				if (err) {
					return reject(err);
				}
				return resolve('Failed to close connections');
			});
		});
	}

	public query(query: string, values?: string[]| number[]): Promise<DatabaseResponse> {
		return new Promise<DatabaseResponse>((resolve, reject) => {
			const preparedStatement = format(query, values as any[]);
			this.connection.query(preparedStatement, (err, results: any) => {
				if (err) {
					return reject(err);
				}
				return resolve({
					data: results
				});
			});
		});
	}
}