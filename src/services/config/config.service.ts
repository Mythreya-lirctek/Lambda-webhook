import { AppConfigDataClient, GetLatestConfigurationCommand, StartConfigurationSessionCommand } from "@aws-sdk/client-appconfigdata";


export class ConfigService {
	public static configs: any;
	public static async loadConfig(): Promise<any> {
		const client = new AppConfigDataClient({ region: "us-west-1" });
		const sessionCommand = new StartConfigurationSessionCommand({
			ApplicationIdentifier: 'v5nbvg3',
			ConfigurationProfileIdentifier: process.env.NODE_ENV === 'production' ? '7ls8xuu' : 'id9hhlm',
			EnvironmentIdentifier: process.env.NODE_ENV === 'production' ? 'v2gyix9' :'gva6a4c',
		});
		const sessionResponse = await client.send(sessionCommand);
		const command = new GetLatestConfigurationCommand({
			ConfigurationToken: sessionResponse.InitialConfigurationToken
		});
		const response = await client.send(command);
		ConfigService.configs = JSON.parse(new TextDecoder().decode(response.Configuration));
		return ConfigService.configs;
	}

	private constructor() {}
}