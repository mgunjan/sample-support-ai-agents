# AWS Bedrock AgentCore Runtime Deployment Guide

This guide explains how to deploy Optira AI agents using AWS Bedrock AgentCore containerized runtime instead of Lambda functions.

## Architecture Overview

The AgentCore Runtime deployment uses:
- **Amazon ECR**: Stores container images for agent runtime
- **Amazon ECS (Fargate)**: Runs containerized agents on ARM64 architecture
- **Application Load Balancer**: Distributes traffic to agent containers
- **API Gateway**: Provides HTTP API interface (same as Lambda deployment)
- **Auto-scaling**: Scales containers based on CPU/memory utilization

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Docker** installed and running
3. **Node.js and npm** installed for CDK
4. **AWS CDK** installed (`npm install -g aws-cdk`)
5. **Sufficient AWS permissions** for:
   - ECR (create repositories, push images)
   - ECS (create clusters, services, task definitions)
   - VPC and networking resources
   - IAM roles and policies
   - API Gateway

## Deployment Steps

### Step 1: Build and Push Container Image

The first step is to build the agent container image and push it to Amazon ECR.

```bash
cd /path/to/optira-core/es-optira

# Build and push with default 'latest' tag
./build-and-push-image.sh

# Or build with a specific version tag
./build-and-push-image.sh v1.0.0
```

This script will:
1. Authenticate Docker to your ECR registry
2. Create ECR repository if it doesn't exist
3. Build Docker image for ARM64 architecture
4. Tag and push image to ECR

### Step 2: Deploy CDK Stack

After the container image is pushed to ECR, deploy the AgentCore Runtime infrastructure:

```bash
# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap

# Review the infrastructure changes
cdk diff OptiraAgentCoreStack

# Deploy the stack
cdk deploy OptiraAgentCoreStack \
  --parameters SupportDataBucket=your-support-data-bucket \
  --parameters EnableWAF=false
```

**Stack Parameters:**
- `SupportDataBucket`: Name of S3 bucket containing support case data
- `CreateNewBucket`: Set to 'true' to create new bucket or 'false' to use existing
- `EnableWAF`: Set to 'true' to enable AWS WAF for DDoS protection

### Step 3: Verify Deployment

After deployment completes, CDK will output important values:

```
OptiraAgentCoreStack.ApiUrl = https://xxxxxxxxxx.execute-api.us-west-2.amazonaws.com/prod/
OptiraAgentCoreStack.ProdApiKeyId = xxxxxxxxxxxxxx
OptiraAgentCoreStack.AgentCoreEndpoint = http://optira-agentcore-alb-xxxxxxxx.us-west-2.elb.amazonaws.com
OptiraAgentCoreStack.EcrRepositoryUri = 123456789012.dkr.ecr.us-west-2.amazonaws.com/optira-agent-runtime
OptiraAgentCoreStack.EcsClusterName = optira-agentcore-cluster
OptiraAgentCoreStack.EcsServiceName = optira-agentcore-service
```

**Verify ECS Service:**
```bash
aws ecs describe-services \
  --cluster optira-agentcore-cluster \
  --services optira-agentcore-service \
  --region us-west-2
```

**Check Container Health:**
```bash
# Get task ARNs
aws ecs list-tasks \
  --cluster optira-agentcore-cluster \
  --service-name optira-agentcore-service \
  --region us-west-2

# View logs
aws logs tail /ecs/optira-agentcore-runtime --follow
```

### Step 4: Test the Deployment

Test the AgentCore Runtime endpoint:

```bash
# Get the API URL and API Key from CDK outputs
API_URL="https://xxxxxxxxxx.execute-api.us-west-2.amazonaws.com/prod/prompt"

# Get the API Key value
API_KEY=$(aws apigateway get-api-key \
  --api-key <ProdApiKeyId-from-output> \
  --include-value \
  --query 'value' \
  --output text)

# Test the agent
curl -X POST ${API_URL} \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"query":"How many support cases do we have in total?"}'
```

### Step 5: Update Web Interface Configuration

Update the web interface environment variables to use the new AgentCore Runtime endpoint:

```bash
cd /path/to/optira-web

# Update .env file
cat > .env << EOF
OPTIRA_API_ENDPOINT=https://xxxxxxxxxx.execute-api.us-west-2.amazonaws.com/prod/prompt
OPTIRA_API_KEY=your-api-key-value
USE_AGENTCORE_RUNTIME=true
REACT_APP_AWS_REGION=us-west-2
SERVER_PORT=3001
EOF

# Restart the web server
npm start
```

## Updating the Container Image

When you update agent code, rebuild and redeploy:

```bash
# Build and push new image with version tag
./build-and-push-image.sh v1.1.0

# Force ECS to deploy new image
aws ecs update-service \
  --cluster optira-agentcore-cluster \
  --service optira-agentcore-service \
  --force-new-deployment \
  --region us-west-2

# Monitor deployment
aws ecs describe-services \
  --cluster optira-agentcore-cluster \
  --services optira-agentcore-service \
  --region us-west-2
```

## Scaling Configuration

The AgentCore Runtime deployment includes auto-scaling:

**Default Configuration:**
- **Min tasks**: 2 (high availability)
- **Max tasks**: 10
- **CPU scaling**: Triggers at 70% utilization
- **Memory scaling**: Triggers at 80% utilization

**Manual Scaling:**
```bash
# Scale to specific count
aws ecs update-service \
  --cluster optira-agentcore-cluster \
  --service optira-agentcore-service \
  --desired-count 5 \
  --region us-west-2
```

**Update Auto-scaling Thresholds:**

Modify the CDK stack (`lib/agent-agentcore-stack.ts`):
```typescript
scaling.scaleOnCpuUtilization('OptiraAgentCpuScaling', {
  targetUtilizationPercent: 60,  // Change from 70 to 60
  // ...
});
```

Then redeploy:
```bash
cdk deploy OptiraAgentCoreStack
```

## Monitoring and Troubleshooting

### CloudWatch Logs

View agent logs:
```bash
# Stream logs in real-time
aws logs tail /ecs/optira-agentcore-runtime --follow

# View recent logs
aws logs tail /ecs/optira-agentcore-runtime --since 1h
```

### CloudWatch Metrics

Key metrics to monitor:
- **ECS Service**: CPU/Memory utilization, Running task count
- **ALB**: Request count, Target response time, HTTP errors
- **API Gateway**: Request count, Latency, 4XX/5XX errors

### Common Issues

**1. Container fails health checks**
```bash
# Check container logs
aws logs tail /ecs/optira-agentcore-runtime --since 30m

# Verify environment variables in task definition
aws ecs describe-task-definition \
  --task-definition OptiraAgentCoreStack-OptiraAgentTaskDef
```

**2. ECS tasks not starting**
- Check IAM roles have correct permissions
- Verify ECR image exists and is accessible
- Check VPC/security group configuration

**3. API Gateway returns 5XX errors**
- Verify ALB health checks are passing
- Check ECS service has running tasks
- Review CloudWatch logs for errors

## Cost Optimization

**AgentCore Runtime (ECS Fargate) vs Lambda:**

**Advantages of AgentCore Runtime:**
- Better performance for long-running agent interactions
- More predictable costs for consistent workloads
- Greater control over container environment
- Better session management and state handling

**Cost Considerations:**
- Fargate costs based on vCPU/memory allocation and runtime
- ALB costs for load balancing
- Consider reducing task count during off-peak hours

**Cost Optimization Tips:**
1. Use Fargate Spot for non-production environments
2. Adjust min/max task counts based on actual usage
3. Right-size task CPU/memory allocation
4. Use lifecycle policies for ECR images

## Rolling Back to Lambda

If you need to revert to Lambda deployment:

1. Edit `bin/cdk-app.ts`:
```typescript
// Comment out AgentCore stack
// new OptiraAgentCoreStack(app, "OptiraAgentCoreStack", {});

// Uncomment Lambda stack
new OptiraAgentLambdaStack(app, "OptiraAgentLambdaStack", {});
```

2. Redeploy:
```bash
cdk deploy OptiraAgentLambdaStack
```

3. Update web interface `.env`:
```bash
USE_AGENTCORE_RUNTIME=false
```

## Architecture Comparison

### Lambda-based Deployment
- ✅ Simpler deployment
- ✅ Automatic scaling
- ✅ Lower cost for sporadic usage
- ❌ Cold start latency
- ❌ 15-minute execution limit
- ❌ Limited environment customization

### AgentCore Runtime (Containerized)
- ✅ No cold starts
- ✅ Longer execution times
- ✅ Full container environment control
- ✅ Better for persistent agent sessions
- ✅ Easier local development and testing
- ❌ More complex infrastructure
- ❌ Higher baseline cost

## Security Considerations

1. **IAM Roles**: Task role has minimal required permissions
2. **Network Security**: 
   - Containers run in private subnets
   - ALB is internet-facing
   - Security groups restrict access
3. **API Gateway**: Protected with API keys and usage plans
4. **Container Scanning**: ECR images scanned on push
5. **WAF**: Optional DDoS protection (enable with EnableWAF=true)

## Support and Troubleshooting

For issues or questions:
1. Check CloudWatch logs: `/ecs/optira-agentcore-runtime`
2. Review ECS service events
3. Verify all prerequisites are met
4. Contact your AWS Technical Account Manager

## Additional Resources

- [AWS Bedrock AgentCore Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [Amazon ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [Strands Agents SDK](https://strandsagents.com/latest/documentation/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
