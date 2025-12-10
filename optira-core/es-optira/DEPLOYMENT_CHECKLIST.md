# AgentCore Runtime Deployment Checklist

Use this checklist to ensure a successful deployment of Optira agents on AWS Bedrock AgentCore Runtime.

## Pre-Deployment Checklist

### Environment Setup
- [ ] Docker installed and running (version 20.10+)
- [ ] AWS CLI installed and configured (version 2.x)
- [ ] Node.js and npm installed (version 18+)
- [ ] AWS CDK CLI installed (`npm install -g aws-cdk`)
- [ ] Git repository cloned locally

### AWS Prerequisites
- [ ] AWS account with appropriate permissions
- [ ] IAM permissions verified:
  - [ ] ECR: Create repositories, push images
  - [ ] ECS: Create clusters, services, tasks
  - [ ] VPC: Create VPCs, subnets, NAT gateways
  - [ ] EC2: Create load balancers, target groups
  - [ ] IAM: Create and attach roles
  - [ ] API Gateway: Create and configure APIs
  - [ ] CloudWatch: Create log groups
- [ ] AWS region selected (recommend: us-west-2)
- [ ] CDK bootstrapped in target region:
  ```bash
  cdk bootstrap aws://ACCOUNT-ID/REGION
  ```

### Required AWS Resources
- [ ] S3 bucket for support data exists (or will be created)
- [ ] Secrets Manager secret created:
  ```bash
  aws secretsmanager create-secret \
    --name optira/knowledge-base-id \
    --secret-string '{"knowledge_base_id":"YOUR-KB-ID"}'
  ```
- [ ] Bedrock Knowledge Base configured
- [ ] Athena database `optira_database` created
- [ ] Bedrock model access enabled for Claude 3.7 Sonnet

## Deployment Checklist

### Step 1: Code Review
- [ ] Reviewed `lambda/` directory agent code
- [ ] Verified all tools present:
  - [ ] lambda_function.py
  - [ ] bedrockAPI.py
  - [ ] caseAggregationTool.py
  - [ ] knowledgeBaseTool.py
  - [ ] queryExecutor.py
- [ ] Dockerfile exists in `lambda/` directory
- [ ] requirements.txt contains all dependencies

### Step 2: Build Container Image
- [ ] Navigate to `optira-core/es-optira`
- [ ] Review Dockerfile for any customizations needed
- [ ] Run build script:
  ```bash
  ./build-and-push-image.sh
  ```
- [ ] Verify success message displayed
- [ ] Confirm image in ECR:
  ```bash
  aws ecr describe-images --repository-name optira-agent-runtime
  ```
- [ ] Note image URI from output

### Step 3: CDK Deployment
- [ ] Install NPM dependencies:
  ```bash
  npm install
  ```
- [ ] Review CDK app configuration (`bin/cdk-app.ts`)
- [ ] Verify AgentCore stack is active (not Lambda)
- [ ] Prepare stack parameters:
  - [ ] Support bucket name
  - [ ] WAF preference (true/false)
- [ ] Synthesize stack to review changes:
  ```bash
  cdk synth OptiraAgentCoreStack
  ```
- [ ] Review generated CloudFormation template
- [ ] Deploy stack:
  ```bash
  cdk deploy OptiraAgentCoreStack \
    --parameters SupportDataBucket=YOUR-BUCKET-NAME \
    --parameters EnableWAF=false
  ```
- [ ] Wait for deployment to complete (10-15 minutes)
- [ ] Save stack outputs:
  - [ ] ApiUrl
  - [ ] ProdApiKeyId
  - [ ] AgentCoreEndpoint
  - [ ] EcrRepositoryUri
  - [ ] EcsClusterName
  - [ ] EcsServiceName

### Step 4: Verify ECS Deployment
- [ ] Check ECS service status:
  ```bash
  aws ecs describe-services \
    --cluster optira-agentcore-cluster \
    --services optira-agentcore-service
  ```
- [ ] Verify desired task count: 2
- [ ] Verify running task count: 2
- [ ] Check task health status: HEALTHY
- [ ] View CloudWatch logs:
  ```bash
  aws logs tail /ecs/optira-agentcore-runtime --follow
  ```
- [ ] Confirm no error messages in logs
- [ ] Check ALB target health:
  ```bash
  aws elbv2 describe-target-health \
    --target-group-arn <from-stack-output>
  ```
- [ ] Verify all targets healthy

### Step 5: API Gateway Testing
- [ ] Get API URL from stack outputs
- [ ] Get API key value:
  ```bash
  aws apigateway get-api-key \
    --api-key <ProdApiKeyId> \
    --include-value \
    --query 'value' \
    --output text
  ```
- [ ] Test API endpoint:
  ```bash
  curl -X POST <ApiUrl>/prompt \
    -H "Content-Type: application/json" \
    -H "x-api-key: <API-KEY>" \
    -d '{"query":"How many support cases do we have?"}'
  ```
- [ ] Verify 200 response
- [ ] Verify agent response is valid
- [ ] Test error handling:
  ```bash
  curl -X POST <ApiUrl>/prompt \
    -H "Content-Type: application/json" \
    -H "x-api-key: INVALID-KEY" \
    -d '{"query":"test"}'
  ```
- [ ] Verify 403 Forbidden response

### Step 6: Web Interface Configuration
- [ ] Navigate to `optira-web` directory
- [ ] Run configuration script:
  ```bash
  ./configure-agentcore.sh
  ```
- [ ] Verify .env file created
- [ ] Review environment variables:
  - [ ] OPTIRA_API_ENDPOINT
  - [ ] OPTIRA_API_KEY
  - [ ] USE_AGENTCORE_RUNTIME=true
- [ ] Start web server:
  ```bash
  npm start
  ```
- [ ] Open browser to http://localhost:3000
- [ ] Test sample queries:
  - [ ] "Total count of support cases"
  - [ ] "Show me OpenSearch cases"
  - [ ] Custom queries
- [ ] Verify responses display correctly
- [ ] Check browser console for errors

### Step 7: Functional Testing
Test all agent capabilities:

#### Case Aggregation Tool
- [ ] Test: "How many support cases in January 2025?"
- [ ] Verify Athena query execution
- [ ] Confirm results returned

#### Knowledge Base Tool
- [ ] Test: "What are common OpenSearch issues?"
- [ ] Verify KB retrieval
- [ ] Confirm relevant responses

#### Combined Query
- [ ] Test: "Find high-severity OpenSearch cases and related KB articles"
- [ ] Verify both tools invoked
- [ ] Confirm coordinated response

#### Error Scenarios
- [ ] Test with invalid input
- [ ] Test with very long query (>2000 chars)
- [ ] Verify proper error messages

### Step 8: Performance Testing
- [ ] Send 10 concurrent requests
- [ ] Monitor response times
- [ ] Check CloudWatch metrics:
  - [ ] ECS CPU utilization
  - [ ] ECS memory utilization
  - [ ] ALB request count
  - [ ] API Gateway latency
- [ ] Verify auto-scaling not triggered (baseline)
- [ ] Send 50 concurrent requests
- [ ] Verify auto-scaling triggers if needed
- [ ] Monitor new tasks starting

## Post-Deployment Checklist

### Monitoring Setup
- [ ] CloudWatch dashboard created
- [ ] Key metrics added:
  - [ ] ECS task count
  - [ ] CPU/Memory utilization
  - [ ] ALB healthy target count
  - [ ] API Gateway 4xx/5xx errors
  - [ ] API Gateway latency
- [ ] CloudWatch alarms configured:
  - [ ] High CPU (>80%)
  - [ ] High memory (>85%)
  - [ ] No healthy targets
  - [ ] High error rate (>5%)
- [ ] Log insights queries saved
- [ ] SNS topic for alarms configured

### Security Review
- [ ] Security groups reviewed and minimal
- [ ] IAM roles follow least privilege
- [ ] API keys secured (not in source control)
- [ ] Secrets Manager used for sensitive data
- [ ] Container images scanned (ECR scan on push)
- [ ] VPC configuration reviewed
- [ ] Consider WAF enabled for production

### Documentation
- [ ] Deployment notes documented
- [ ] API endpoint URL documented
- [ ] API key stored securely
- [ ] Runbook created for operations team
- [ ] Rollback procedure documented
- [ ] Troubleshooting guide reviewed

### Operational Readiness
- [ ] Team trained on new architecture
- [ ] Monitoring reviewed with team
- [ ] Escalation procedures updated
- [ ] Maintenance windows planned
- [ ] Backup/recovery tested
- [ ] Cost tracking set up

## Validation Checklist

### Functionality
- [x] All agent tools working
- [x] API Gateway integration working
- [x] Web interface functional
- [x] Error handling appropriate
- [x] Logging captured correctly

### Performance
- [x] Response times acceptable (<3s)
- [x] No cold starts observed
- [x] Auto-scaling functioning
- [x] Load testing passed

### Reliability
- [x] Health checks passing
- [x] Tasks restart on failure
- [x] Multiple AZ deployment
- [x] Proper monitoring in place

### Security
- [x] API authentication working
- [x] IAM permissions minimal
- [x] Network security correct
- [x] Secrets properly managed

## Rollback Checklist

If issues occur:

### Immediate Rollback (Web Only)
- [ ] Restore .env.backup file
- [ ] Set USE_AGENTCORE_RUNTIME=false
- [ ] Restart web server
- [ ] Verify Lambda endpoint working

### Full Rollback (Infrastructure)
- [ ] Notify team of rollback
- [ ] Document rollback reason
- [ ] Execute: `cdk destroy OptiraAgentCoreStack`
- [ ] Verify Lambda stack still operational
- [ ] Update web interface to Lambda endpoint
- [ ] Perform post-rollback testing
- [ ] Review logs for root cause

## Success Criteria

Deployment is successful when:
- [x] Container image built and pushed to ECR
- [x] ECS service running with 2 healthy tasks
- [x] API Gateway returning 200 responses
- [x] Web interface connected and functional
- [x] All agent tools working correctly
- [x] Response times under 3 seconds
- [x] No errors in CloudWatch logs
- [x] Monitoring dashboards showing healthy status
- [x] Team confident in new deployment

## Notes Section

**Deployment Date:** _________________

**Deployed By:** _________________

**Stack Name:** OptiraAgentCoreStack

**Region:** _________________

**API Endpoint:** _________________

**Issues Encountered:**
_________________________________________________
_________________________________________________
_________________________________________________

**Resolution Steps:**
_________________________________________________
_________________________________________________
_________________________________________________

**Post-Deployment Actions:**
_________________________________________________
_________________________________________________
_________________________________________________

## Sign-Off

**Technical Lead:** _________________ Date: _______

**Operations Lead:** _________________ Date: _______

**Security Review:** _________________ Date: _______
