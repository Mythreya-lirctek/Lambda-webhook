import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { join } from 'path';
import {Duration} from "aws-cdk-lib";

export class LirctekApiServiceCdkStack extends cdk.Stack {

	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// lambda function
		const nylasLambda = new lambda.Function(this, "NylasLambdaHandler", {
			runtime: Runtime.NODEJS_18_X,
			code: lambda.Code.fromAsset(join(__dirname, `/../dist/handlers/nylas`)),
			handler: 'index.handler',
			timeout: Duration.seconds(512),
			memorySize: 1024
		});
		const nylasSqsLambda = new lambda.Function(this, "NylasSqsLambdaHandler", {
			runtime: Runtime.NODEJS_18_X,
			code: lambda.Code.fromAsset(join(__dirname, `/../dist/handlers/nylasSqs`)),
			handler: 'index.handler',
			timeout: Duration.seconds(512),
			memorySize: 1024
		});
		const macropointLambda = new lambda.Function(this, "MacropointLambdaHandler", {
			runtime: Runtime.NODEJS_18_X,
			code: lambda.Code.fromAsset(join(__dirname, `/../dist/handlers/macropoint`)),
			handler: 'index.handler',
			timeout: Duration.seconds(512),
			memorySize: 1024
		});
		const relayPaymentsLambda = new lambda.Function(this, "relayPaymentsLambdaHandler", {
			runtime: Runtime.NODEJS_18_X,
			code: lambda.Code.fromAsset(join(__dirname, `/../dist/handlers/relayPayments`)),
			handler: 'index.handler',
			timeout: Duration.seconds(512),
			memorySize: 1024
		});
		const appConfigPolicyStatement = new iam.PolicyStatement({
			actions:[
				"appConfig:GetLatestConfiguration",
				"appConfig:StartConfigurationSession"
			],
			resources:['*']
		});

		const iamPolicy = new iam.Policy(this, 'appconfig-policy', {
			statements: [
				appConfigPolicyStatement
			]
		});

		nylasLambda.role?.attachInlinePolicy(
			iamPolicy
		);

		macropointLambda.role?.attachInlinePolicy(
			iamPolicy
		);

		relayPaymentsLambda.role?.attachInlinePolicy(
			iamPolicy
		);

		nylasSqsLambda.role?.attachInlinePolicy(
			iamPolicy
		);

		const nylasIntegration = new apigw.LambdaIntegration(nylasLambda, {	});
		const apiService = new apigw.RestApi(this, 'awako-webhook-api', {
			restApiName: "Awako Webhook Service",
			description: "This service serves external webhooks."
		});

		const nylasResource = apiService.root.addResource('nylas');
		nylasResource.addMethod('GET', nylasIntegration, {
			authorizationType: apigw.AuthorizationType.NONE,
		});
		nylasResource.addMethod('POST', nylasIntegration, {
			authorizationType: apigw.AuthorizationType.NONE,
		});

		const macroPointResource = apiService.root.addResource('macropoint');
		macroPointResource.addMethod('POST', new apigw.LambdaIntegration(macropointLambda, {}), {
			authorizationType: apigw.AuthorizationType.NONE,
		});

		const relayPaymentsResource = apiService.root.addResource('relayPayments');
		relayPaymentsResource.addMethod('POST', new apigw.LambdaIntegration(relayPaymentsLambda, {}), {
			authorizationType: apigw.AuthorizationType.NONE,
		});

		const nylasSqsResource = apiService.root.addResource('nylasSqs');
		nylasSqsResource.addMethod('POST', new apigw.LambdaIntegration(nylasSqsLambda, {}), {
			authorizationType: apigw.AuthorizationType.NONE,
		});

		const usagePlan = apiService.addUsagePlan('apiServiceUsagePlan', {
			name: 'ServiceUsageEasyPlan',
			throttle: {
				rateLimit: 50,
				burstLimit: 2
			}
		});
		const apiKey = apiService.addApiKey('WebhookApiKey');
		usagePlan.addApiKey(apiKey);
	}
}	
