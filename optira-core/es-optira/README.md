# Optira Agent Deployment

CDK TypeScript project to deploy Optira AI agents with Bedrock integration.

## Deployment Options

Optira supports two deployment architectures:

### 1. **AWS Bedrock AgentCore Runtime (Containerized)** - RECOMMENDED
Deploys agents as containers on ECS Fargate with AgentCore Runtime for better performance, no cold starts, and improved session management.

📖 **See [AGENTCORE_DEPLOYMENT.md](./AGENTCORE_DEPLOYMENT.md) for complete deployment guide**

**Benefits:**
- ✅ No cold start latency
- ✅ Longer execution times
- ✅ Better session management
- ✅ Full container environment control
- ✅ ARM64 architecture support

**Quick Start:**
```bash
# Build and push container image
./build-and-push-image.sh

# Deploy AgentCore Runtime stack
cdk deploy OptiraAgentCoreStack \
  --parameters SupportDataBucket=your-bucket-name
```

### 2. **AWS Lambda (Legacy)** - For backward compatibility
Traditional serverless deployment using Lambda functions.

**Benefits:**
- ✅ Simpler deployment
- ✅ Lower cost for sporadic usage
- ✅ Automatic scaling

**Quick Start:**
```bash
# Package Lambda dependencies
python bin/package_for_lambda.py

# Deploy Lambda stack
cdk deploy OptiraAgentLambdaStack \
  --parameters SupportDataBucket=your-bucket-name
```

## Prerequisites

- Node.js and npm
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS CLI configured with appropriate permissions
- Docker (for AgentCore Runtime deployment)
- Python 3.12+ (for agent code)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Bootstrap CDK (first time only):
   ```bash
   cdk bootstrap
   ```

3. Create required AWS Secrets:
   ```bash
   # Create Knowledge Base ID secret
   aws secretsmanager create-secret \
     --name optira/knowledge-base-id \
     --secret-string '{"knowledge_base_id":"your-kb-id"}'
   ```

## Architecture Selection

The default deployment uses **AgentCore Runtime (containerized)**. To switch between architectures, edit `bin/cdk-app.ts`:

**For AgentCore Runtime (default):**
```typescript
new OptiraAgentCoreStack(app, "OptiraAgentCoreStack", {});
```

**For Lambda deployment:**
```typescript
new OptiraAgentLambdaStack(app, "OptiraAgentLambdaStack", {});
```

## Project Structure

- `bin/`: CDK app entry point
  - `cdk-app.ts`: Main CDK application
  - `package_for_lambda.py`: Lambda packaging script
- `lib/`: CDK stack definitions
  - `agent-agentcore-stack.ts`: AgentCore Runtime infrastructure (ECS/Fargate)
  - `agent-lambda-stack.ts`: Lambda-based infrastructure (legacy)
- `lambda/`: Agent source code
  - `lambda_function.py`: Main agent handler
  - `bedrockAPI.py`: Bedrock API integration
  - `knowledgeBaseTool.py`: Knowledge base operations
  - `caseAggregationTool.py`: Case aggregation logic
  - `queryExecutor.py`: Query execution utilities
  - `Dockerfile`: Container image definition for AgentCore Runtime
  - `requirements.txt`: Python dependencies
- `build-and-push-image.sh`: Script to build and push container images
- `AGENTCORE_DEPLOYMENT.md`: Detailed AgentCore deployment guide
- `requirements.txt`: Python dependencies for Lambda layers
- `cdk.json`: CDK configuration

## Deployment Parameters

Both deployment options accept the following parameters:

- **SupportDataBucket**: (Required) S3 bucket name for support case data
- **CreateNewBucket**: 'true' to create new bucket, 'false' to use existing (default: 'true')
- **EnableWAF**: 'true' to enable AWS WAF for DDoS protection (default: 'false')

## Environment Variables

The agent runtime uses these environment variables (configured automatically):

- `ATHENA_DATABASE`: Database name for Athena queries
- `ATHENA_OUTPUT_S3`: S3 location for Athena query results
- `BEDROCK_MODEL_ID`: Bedrock model identifier
- `KNOWLEDGEBASE_ID`: Knowledge base ID from Secrets Manager
- `MAX_PARALLEL_TOOLS`: Maximum concurrent tool executions
- `MAX_QUERY_EXECUTION_TIME`: Athena query timeout in seconds
- `MAX_TOKENS`: Maximum tokens for LLM responses
- `SYSTEM_PROMPT`: System prompt for the agent

## Testing

After deployment, test the agent:

```bash
# Get API URL and Key from stack outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name OptiraAgentCoreStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

API_KEY_ID=$(aws cloudformation describe-stacks \
  --stack-name OptiraAgentCoreStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProdApiKeyId`].OutputValue' \
  --output text)

API_KEY=$(aws apigateway get-api-key \
  --api-key ${API_KEY_ID} \
  --include-value \
  --query 'value' \
  --output text)

# Test the agent
curl -X POST ${API_URL}prompt \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"query":"How many support cases do we have?"}'
```

## Monitoring

### AgentCore Runtime
- CloudWatch Logs: `/ecs/optira-agentcore-runtime`
- ECS Service metrics: CPU, memory, task count
- ALB metrics: Request count, latency, errors

### Lambda Deployment
- CloudWatch Logs: `/aws/lambda/OptiraAgentFunction`
- Lambda metrics: Invocations, duration, errors, throttles

## Updating Agent Code

### For AgentCore Runtime:
```bash
# Make changes to lambda/*.py files
# Rebuild and push image
./build-and-push-image.sh v1.1.0

# Force ECS to deploy new image
aws ecs update-service \
  --cluster optira-agentcore-cluster \
  --service optira-agentcore-service \
  --force-new-deployment
```

### For Lambda:
```bash
# Make changes to lambda/*.py files
# Repackage and redeploy
python bin/package_for_lambda.py
cdk deploy OptiraAgentLambdaStack
```

## Troubleshooting

See [AGENTCORE_DEPLOYMENT.md](./AGENTCORE_DEPLOYMENT.md#monitoring-and-troubleshooting) for detailed troubleshooting guide.

Common issues:
1. **Container health check failures**: Check CloudWatch logs for errors
2. **API Gateway timeouts**: Verify ECS tasks are running and healthy
3. **Permission errors**: Ensure IAM roles have required permissions

## Cost Considerations

**AgentCore Runtime:**
- Fargate task costs (vCPU + memory × runtime)
- Application Load Balancer costs
- NAT Gateway costs
- Best for: Consistent workloads, long-running sessions

**Lambda:**
- Per-request pricing (invocations + duration)
- Lower baseline cost
- Best for: Sporadic usage, simple queries

## Additional Resources

- [AWS Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [Strands Agents SDK](https://strandsagents.com/latest/documentation/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Amazon ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)