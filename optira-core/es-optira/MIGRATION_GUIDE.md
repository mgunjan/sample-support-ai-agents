# Migration Guide: Lambda to AgentCore Runtime

This guide helps you migrate from Lambda-based agent deployment to AWS Bedrock AgentCore containerized runtime.

## Overview

**What's changing:**
- Agent execution: Lambda functions → ECS Fargate containers
- Invocation method: Direct Lambda invoke → HTTP endpoint via ALB
- Infrastructure: Lambda + Layer → ECR + ECS + ALB + Auto-scaling

**What stays the same:**
- Agent code (lambda/*.py files)
- API Gateway interface
- IAM permissions and policies
- Environment variables
- Web interface (with minor config changes)

## Migration Benefits

1. **No Cold Starts**: Containers are always warm
2. **Longer Execution Time**: No 15-minute Lambda limit
3. **Better Session Management**: Persistent container environment
4. **Consistent Performance**: Predictable latency
5. **Easier Development**: Standard Docker workflow

## Pre-Migration Checklist

- [ ] Docker installed and running locally
- [ ] AWS CLI configured with appropriate credentials
- [ ] Sufficient AWS permissions (ECR, ECS, VPC, ALB, ECS)
- [ ] Backup current Lambda deployment (optional but recommended)
- [ ] Note current API Gateway endpoint and keys
- [ ] Test agents in current Lambda deployment

## Step-by-Step Migration

### Step 1: Backup Current Configuration

```bash
# Export current stack outputs
aws cloudformation describe-stacks \
  --stack-name OptiraAgentLambdaStack \
  --query 'Stacks[0].Outputs' > lambda-outputs.json

# Backup current .env file
cp optira-web/.env optira-web/.env.lambda-backup
```

### Step 2: Build Container Image

```bash
cd optira-core/es-optira

# Build and push container image
./build-and-push-image.sh v1.0.0

# Verify image was pushed
aws ecr describe-images \
  --repository-name optira-agent-runtime \
  --region us-west-2
```

**Expected output:**
```
Image pushed to: 123456789012.dkr.ecr.us-west-2.amazonaws.com/optira-agent-runtime:v1.0.0
```

### Step 3: Deploy AgentCore Runtime Stack

```bash
# Get current bucket name from Lambda stack
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name OptiraAgentLambdaStack \
  --query 'Stacks[0].Parameters[?ParameterKey==`SupportDataBucket`].ParameterValue' \
  --output text)

# Deploy new AgentCore stack
cdk deploy OptiraAgentCoreStack \
  --parameters SupportDataBucket=${BUCKET_NAME} \
  --parameters CreateNewBucket=false \
  --parameters EnableWAF=false
```

**Important:** This creates a NEW stack alongside your existing Lambda stack. Both will run simultaneously until you complete the migration.

### Step 4: Test AgentCore Runtime

```bash
# Get new API endpoint
AGENTCORE_API_URL=$(aws cloudformation describe-stacks \
  --stack-name OptiraAgentCoreStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

# Get API key
API_KEY_ID=$(aws cloudformation describe-stacks \
  --stack-name OptiraAgentCoreStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ProdApiKeyId`].OutputValue' \
  --output text)

API_KEY=$(aws apigateway get-api-key \
  --api-key ${API_KEY_ID} \
  --include-value \
  --query 'value' \
  --output text)

# Test the new endpoint
curl -X POST ${AGENTCORE_API_URL}prompt \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"query":"How many support cases do we have in total?"}'
```

**Expected response:**
```json
{
  "statusCode": 200,
  "body": "result: Based on the data..."
}
```

### Step 5: Update Web Interface

```bash
cd optira-web

# Update .env file
cat > .env << EOF
OPTIRA_API_ENDPOINT=${AGENTCORE_API_URL}prompt
OPTIRA_API_KEY=${API_KEY}
USE_AGENTCORE_RUNTIME=true
REACT_APP_AWS_REGION=us-west-2
SERVER_PORT=3001
NODE_ENV=development
EOF

# Restart web server
npm start
```

### Step 6: Verify Web Interface

1. Open browser to `http://localhost:3000`
2. Test with sample queries:
   - "How many support cases do we have?"
   - "Show me recent OpenSearch cases"
3. Check browser console for any errors
4. Verify responses match Lambda deployment

### Step 7: Parallel Running (Optional but Recommended)

Run both deployments in parallel for a test period:

**Advantages:**
- Quick rollback if issues arise
- A/B testing possible
- Zero downtime migration

**Monitor both:**
```bash
# Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=OptiraAgentFunction \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# ECS metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=optira-agentcore-service \
              Name=ClusterName,Value=optira-agentcore-cluster \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

### Step 8: Cleanup Lambda Stack (After Successful Testing)

**⚠️ WARNING:** Only do this after thoroughly testing the AgentCore Runtime deployment.

```bash
# Destroy Lambda stack
cdk destroy OptiraAgentLambdaStack

# Or keep it for backup/rollback capability
# (You'll pay for both running simultaneously)
```

## Rollback Procedure

If you need to rollback to Lambda:

### Quick Rollback (Web Interface Only)

```bash
cd optira-web

# Restore Lambda configuration
cp .env.lambda-backup .env

# Restart web server
npm restart
```

### Full Rollback (Remove AgentCore Stack)

```bash
cd optira-core/es-optira

# Destroy AgentCore stack
cdk destroy OptiraAgentCoreStack

# This removes:
# - ECS cluster and services
# - Load balancer
# - VPC (if created)
# - API Gateway (AgentCore version)
# - ECR repository is retained for future use
```

## Comparing Costs

### Lambda Deployment Monthly Cost Example
```
Assumptions:
- 10,000 requests/month
- 30 seconds average duration
- 10GB memory allocation

Lambda: $50-100/month
API Gateway: $35/month
Total: ~$85-135/month
```

### AgentCore Runtime Monthly Cost Example
```
Assumptions:
- 2 tasks (min), 4 vCPU, 8GB memory each
- Running 24/7
- Application Load Balancer

Fargate: ~$300-400/month
ALB: ~$25/month
NAT Gateway: ~$35/month
API Gateway: $35/month
Total: ~$395-495/month
```

**When AgentCore is More Cost-Effective:**
- High request volume (>100,000/month)
- Long-running queries (>1 minute average)
- Consistent usage patterns
- Session/state management needs

**When Lambda is More Cost-Effective:**
- Low request volume (<10,000/month)
- Short queries (<30 seconds)
- Sporadic usage
- Simple stateless operations

## Performance Comparison

| Metric | Lambda | AgentCore Runtime |
|--------|--------|-------------------|
| Cold Start | 2-5 seconds | None (0ms) |
| Warm Response | 50-200ms | 50-100ms |
| Max Duration | 15 minutes | Unlimited* |
| Concurrency | Auto-scale | 2-10 tasks |
| Memory | 128MB-10GB | Configurable |

*Limited by API Gateway 29-second timeout, but container can continue processing

## Feature Parity Checklist

After migration, verify:

- [ ] All agent tools work correctly (case_aggregation, knowledge_insight)
- [ ] Authentication and API keys function
- [ ] Rate limiting and quotas are enforced
- [ ] CloudWatch logs are captured
- [ ] Error handling works as expected
- [ ] Response formatting is consistent
- [ ] Session management works (if used)
- [ ] Auto-scaling triggers appropriately
- [ ] Health checks pass consistently

## Troubleshooting Migration Issues

### Issue: Container fails to start

**Symptoms:** ECS tasks continually restart

**Solution:**
```bash
# Check container logs
aws logs tail /ecs/optira-agentcore-runtime --follow

# Common causes:
# 1. Missing environment variables
# 2. Incorrect IAM permissions
# 3. Image not found in ECR
# 4. Health check failure

# Verify task definition
aws ecs describe-task-definition \
  --task-definition OptiraAgentCoreStack-OptiraAgentTaskDef
```

### Issue: API Gateway returns 504 timeout

**Symptoms:** Requests timeout after 29 seconds

**Solution:**
```bash
# Check if ECS tasks are healthy
aws ecs describe-services \
  --cluster optira-agentcore-cluster \
  --services optira-agentcore-service

# Check ALB target health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn>

# Verify security groups allow traffic
```

### Issue: Higher latency than Lambda

**Symptoms:** Responses take longer than before

**Solution:**
- Check ECS task CPU/memory utilization
- Verify ALB health check settings
- Consider increasing task count
- Check network latency (VPC/NAT configuration)

### Issue: Web interface can't connect

**Symptoms:** Connection errors in browser console

**Solution:**
```bash
# Verify API endpoint is correct
echo $OPTIRA_API_ENDPOINT

# Test endpoint directly
curl -v ${OPTIRA_API_ENDPOINT}

# Check CORS configuration
# Verify API key is valid
aws apigateway get-api-key --api-key ${API_KEY_ID} --include-value
```

## Migration Timeline Recommendation

**Week 1: Preparation**
- Review documentation
- Set up Docker environment
- Test container build locally
- Plan rollback strategy

**Week 2: Deployment**
- Build and push container image
- Deploy AgentCore stack
- Perform initial testing
- Document any issues

**Week 3: Parallel Running**
- Run both deployments
- Monitor metrics and costs
- Gather user feedback
- Fine-tune configuration

**Week 4: Cutover**
- Update web interface
- Monitor closely for 48 hours
- Decommission Lambda stack
- Document final configuration

## Best Practices Post-Migration

1. **Monitoring**: Set up CloudWatch alarms for key metrics
2. **Auto-scaling**: Adjust min/max tasks based on usage patterns
3. **Cost Optimization**: Review and optimize resource allocation
4. **Disaster Recovery**: Test rollback procedure periodically
5. **Documentation**: Keep runbooks updated
6. **Security**: Regular security group and IAM role audits

## Getting Help

If you encounter issues during migration:

1. Check CloudWatch logs: `/ecs/optira-agentcore-runtime`
2. Review [AGENTCORE_DEPLOYMENT.md](./AGENTCORE_DEPLOYMENT.md)
3. Test with `curl` commands to isolate issues
4. Contact your AWS Technical Account Manager

## Summary

The migration from Lambda to AgentCore Runtime provides:
- ✅ Better performance (no cold starts)
- ✅ Improved reliability (container health checks)
- ✅ Enhanced session management
- ✅ Greater flexibility (full container environment)

The process is straightforward and can be done with zero downtime by running both deployments in parallel during the migration period.
