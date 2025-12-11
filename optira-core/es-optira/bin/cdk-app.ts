#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { OptiraAgentLambdaStack } from "../lib/agent-lambda-stack";
import { OptiraAgentCoreStack } from "../lib/agent-agentcore-stack";

const app = new App();

// Use AgentCore Runtime stack (containerized deployment)
// Comment this out and uncomment the Lambda stack below if you want to use Lambda instead
new OptiraAgentCoreStack(app, "OptiraAgentCoreStack", {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

// Legacy Lambda-based deployment (kept for backward compatibility)
// Uncomment this and comment out the AgentCore stack above to use Lambda deployment
/*
new OptiraAgentLambdaStack(app, "OptiraAgentLambdaStack", {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
*/