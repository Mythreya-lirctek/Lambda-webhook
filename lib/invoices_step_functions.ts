import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { join } from 'path';
import {Duration} from "aws-cdk-lib";

export class InvoiceServiceCdkStack extends cdk.Stack {

	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const createInvoicesLambda = new lambda.Function(this, "CreateInvoicesLambdaHandler", {
			runtime: Runtime.NODEJS_18_X,
			code: lambda.Code.fromAsset(join(__dirname, `/../dist/handlers/createinvoice`)),
			handler: 'index.createInvoice',
			timeout: Duration.seconds(500),
			memorySize: 1024
		});
		const factorIntegrationLambda = new lambda.Function(this, "FactorIntegrationLambdaHandler", {
			runtime: Runtime.NODEJS_18_X,
			code: lambda.Code.fromAsset(join(__dirname, `/../dist/handlers/factorintegration`)),
			handler: 'index.factorIntegration',
			timeout: Duration.seconds(500),
			memorySize: 1024
		});
		const sendEmailLambda = new lambda.Function(this, "SendEmailLambdaHandler", {
			runtime: Runtime.NODEJS_18_X,
			code: lambda.Code.fromAsset(join(__dirname, `/../dist/handlers/sendEmail`)),
			handler: 'index.sendEmail',
			timeout: Duration.seconds(500),
			memorySize: 1024
		});
		const zipFileLambda = new lambda.Function(this, "ZipFileLambdaHandler", {
			runtime: Runtime.NODEJS_18_X,
			code: lambda.Code.fromAsset(join(__dirname, `/../dist/handlers/zipFile`)),
			handler: 'index.zipFile',
			timeout: Duration.seconds(500),
			memorySize: 1024
		});
		const printInvoiceLambda = new lambda.Function(this, "PrintInvoiceLambdaHandler", {
			runtime: Runtime.NODEJS_18_X,
			code: lambda.Code.fromAsset(join(__dirname, `/../dist/handlers/printInvoice`)),
			handler: 'index.printInvoice',
			timeout: Duration.seconds(500),
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

		createInvoicesLambda.role?.attachInlinePolicy(
			iamPolicy
		);

		factorIntegrationLambda.role?.attachInlinePolicy(
			iamPolicy
		);

		sendEmailLambda.role?.attachInlinePolicy(
			iamPolicy
		);

		zipFileLambda.role?.attachInlinePolicy(
			iamPolicy
		);

		printInvoiceLambda.role?.attachInlinePolicy(
			iamPolicy
		);

		const createInvoiceIntegration = new apigw.LambdaIntegration(createInvoicesLambda, {});

		const apiService = new apigw.RestApi(this, 'invoice-api', {
			restApiName: "Awako Invoice Service",
			description: "This service serves internal invoice API's."
		});

		const createInvoiceResource = apiService.root.addResource('createinvoice');
		createInvoiceResource.addMethod('POST', createInvoiceIntegration, {
			authorizationType: apigw.AuthorizationType.NONE,
		});

		const createInvoice = new tasks.LambdaInvoke(scope, 'createInvoices', {
			lambdaFunction : createInvoicesLambda
		})

		const factorIntegration = new tasks.LambdaInvoke(scope, 'factorIntegrations', {
			lambdaFunction : factorIntegrationLambda
		})

		const sendEmail = new tasks.LambdaInvoke(scope, 'sendEmails', {
			lambdaFunction : sendEmailLambda
		})

		const zipFile = new tasks.LambdaInvoke(scope, 'zipFiles', {
			lambdaFunction : zipFileLambda
		})

		const printInvoice = new tasks.LambdaInvoke(scope, 'printInvoices', {
			lambdaFunction : printInvoiceLambda
		})

		const mapState = new sfn.Map(this, "ProcessInvoices", {
			itemsPath: sfn.JsonPath.stringAt("$.invoices"),
			maxConcurrency: 5,
			resultPath: '$.item'
		});

		mapState.iterator(createInvoice);

		const choiceState = new sfn.Choice(this, 'ChooseFactorIntegrationOrSendEmailOrZipFile');
		choiceState
			.when(sfn.Condition.numberEquals('$.item[0].Payload.body.type', 1), factorIntegration)
			.when(sfn.Condition.numberEquals('$.item[0].Payload.body.type', 2), sendEmail)
			.when(sfn.Condition.numberEquals('$.item[0].Payload.body.type', 3), zipFile)
			.otherwise(printInvoice);

		const parallelState = new sfn.Parallel(this, 'ParallelState')
			.branch(choiceState)
			.next(new sfn.Succeed(this, "success"));

		const chain = sfn.Chain
			.start(mapState)
			.next(parallelState)

		new sfn.StateMachine(this, 'BulkInvoiceApiIntegration', {
			definition: chain
		});
	}

}	
