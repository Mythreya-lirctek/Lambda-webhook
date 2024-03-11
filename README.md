# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template


```
brew install aws/tap/aws-sam-cli
```

## Testing lambda locally

```
npm run build
sam local invoke WebhookLambdaHandler --no-event -t cdk.out/LirctekApiServiceCdkStack.template.json
// With payload
sam local invoke WebhookLambdaHandler --event src/test-data/payload.json -t cdk.out/LirctekApiServiceCdkStack.template.json
```