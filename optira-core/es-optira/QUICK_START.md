# Quick Start Guide - AgentCore Runtime

## 5-Minute Deployment

### Prerequisites Check
```bash
# Check Docker
docker --version

# Check AWS CLI
aws --version

# Check CDK
cdk --version

# Check AWS credentials
aws sts get-caller-identity
```

### Step 1: Build Container (2 min)
```bash
cd optira-core/es-optira
./build-and-push-image.sh
```

### Step 2: Deploy Stack (2 min)
```bash
npm install
cdk deploy OptiraAgentCoreStack \
  --parameters SupportDataBucket=your-support-bucket \
  --parameters EnableWAF=false
```

### Step 3: Test Deployment (1 min)
```bash
# Get outputs
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

# Test
curl -X POST ${API_URL}prompt \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"query":"How many support cases?"}'
```

## Common Commands

### View Logs
```bash
aws logs tail /ecs/optira-agentcore-runtime --follow
```

### Update Container
```bash
./build-and-push-image.sh v1.1.0
aws ecs update-service \
  --cluster optira-agentcore-cluster \
  --service optira-agentcore-service \
  --force-new-deployment
```

### Scale Tasks
```bash
aws ecs update-service \
  --cluster optira-agentcore-cluster \
  --service optira-agentcore-service \
  --desired-count 5
```

### Check Service Status
```bash
aws ecs describe-services \
  --cluster optira-agentcore-cluster \
  --services optira-agentcore-service
```

## Troubleshooting

### Container not starting?
```bash
aws logs tail /ecs/optira-agentcore-runtime --since 30m
```

### API returning errors?
```bash
# Check ECS tasks
aws ecs list-tasks --cluster optira-agentcore-cluster

# Check task health
aws ecs describe-tasks \
  --cluster optira-agentcore-cluster \
  --tasks <task-arn>
```

### Need to rollback?
```bash
# Destroy AgentCore stack
cdk destroy OptiraAgentCoreStack

# Use Lambda stack instead
# (Edit bin/cdk-app.ts to uncomment Lambda stack)
```

## What's Next?

- 📖 Read [AGENTCORE_DEPLOYMENT.md](./AGENTCORE_DEPLOYMENT.md) for details
- 🔄 See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for migrating from Lambda
- 🧪 Run [test-container-locally.sh](./test-container-locally.sh) for local testing
- 📊 Monitor in CloudWatch console

## Key URLs

After deployment, save these:
- API Gateway URL: `https://<api-id>.execute-api.<region>.amazonaws.com/prod/prompt`
- API Key: Available via AWS Console or CLI
- ECS Cluster: `optira-agentcore-cluster`
- CloudWatch Logs: `/ecs/optira-agentcore-runtime`

## Stack Outputs

The deployment provides:
- `ApiUrl`: Your API Gateway endpoint
- `ProdApiKeyId`: API key ID (get value with AWS CLI)
- `AgentCoreEndpoint`: Direct ALB endpoint
- `EcrRepositoryUri`: Container image repository
- `EcsClusterName`: ECS cluster name
- `EcsServiceName`: ECS service name
