import { FieldInfo } from 'mysql';

export default interface DatabaseInterface {
	query(query: string, values?: string[]| number[]): Promise<any>;
	closeConnection(): Promise<any>;
}


export interface DatabaseResponse {
	data: any[],
	fields?:FieldInfo 
}