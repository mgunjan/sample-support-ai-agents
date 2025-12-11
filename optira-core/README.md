# Optira Core

An intelligent AWS support case analysis and insights platform powered by Amazon Bedrock and AWS Bedrock AgentCore Runtime.

## Overview

Optira Core is a comprehensive solution that collects, processes, and analyzes AWS support cases using AI-powered insights. The platform consists of multiple microservices that work together to provide intelligent recommendations and knowledge extraction from support data.

**Current Deployment Model:** The solution uses **AWS Bedrock AgentCore Runtime** with containerized agent deployment on Amazon ECS Fargate, providing production-grade performance, session isolation, and zero cold starts.

## Architecture

The project is organized into the following components:

- **es-optira**: Main AI agent deployed as containerized service on ECS Fargate with AI-powered query processing
- **es-optira-collector**: Data collection service for AWS support cases
- **es-optira-data-pipeline**: Data processing and metadata extraction pipeline
- **es-optira-kb**: Knowledge Base management using Amazon Bedrock

### AgentCore Architecture Benefits

The **AWS Bedrock AgentCore Runtime** deployment provides:

**Session Isolation and Security:**
- Sandboxed container environments for each agent instance
- Real-time deterministic security controls via AgentCore Policy
- Network isolation and container-level security permissions

**Low-Latency Serverless Execution:**
- Zero cold starts - containers are always warm and ready
- Optimized specifically for AI agent workloads with sub-second response times
- Predictable, consistent performance for production environments

**Support for Long-Running Agent Workflows:**
- No 15-minute Lambda execution limits
- Enables complex multi-step reasoning and extensive data analysis
- Better handling of large-scale knowledge base queries and SQL operations

**Framework Flexibility:**
- Full compatibility with Strands SDK and open-source frameworks
- LLM-agnostic design supporting any model provider
- Standard Docker workflows for easy local development and testing

**Production-Grade Agent Deployment at Scale:**
- **Amazon ECS (Fargate)**: Runs agents on ARM64 architecture for cost efficiency
- **Application Load Balancer**: High availability with traffic distribution across containers
- **Amazon ECR**: Secure container image storage with automated vulnerability scanning
- **Auto-scaling**: Dynamically scales from 2 to 10 tasks based on CPU/memory utilization
- **Multi-AZ Deployment**: Ensures reliability with minimum 2 tasks across availability zones

For detailed AgentCore deployment instructions, see [AGENTCORE_DEPLOYMENT.md](./es-optira/AGENTCORE_DEPLOYMENT.md).

## Prerequisites

For **AgentCore Runtime** deployment:
- Docker installed and running (for building container images)
- Node.js (v18 or later)
- Python 3.12
- AWS CLI configured with appropriate permissions
- AWS CDK CLI
- An S3 bucket for storing support case data
- Sufficient AWS permissions for ECR, ECS, VPC, IAM, and API Gateway

## Quick Start (AgentCore Runtime Deployment)

The solution now deploys using **AWS Bedrock AgentCore Runtime** on ECS Fargate for production-grade performance.

1. **Navigate to the optira-core directory**:
   ```bash
   cd optira-core
   ```

2. **Build and push container image**:
   ```bash
   cd es-optira
   ./build-and-push-image.sh
   cd ..
   ```

3. **Deploy all services**:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

4. **Follow the prompts** to enter your S3 bucket name for the Knowledge Base

   **S3 Bucket Options:**
   - **Option 1 (Default)**: Create new bucket - Choose this if you want the system to create a new S3 bucket
   - **Option 2**: Use existing bucket - Choose this if you have an existing S3 bucket you want to use

   The deployment script will ask you to choose between these options after you enter the bucket name.
   
   **AWS WAF Protection Options:**
   - **Option 1 (Default)**: Disable WAF (default - no additional cost)
   - **Option 2**: Enable WAF (provides DDoS protection - additional AWS charges apply)

4. **Increase API Gateway Integration Timeout**

   After deployment, increase the API Gateway integration timeout from 29 seconds to 180 seconds and redeploy API Gateway from the AWS console:

   1. Navigate to AWS Service Quotas console: 'https://{AWS_REGION}.console.aws.amazon.com/servicequotas/home/services/apigateway/quotas'
   2. Search for and select "Maximum integration timeout in milliseconds"
   3. Click "Request increase at account level"
   4. Change the quota value from 29,000 milliseconds to 180,000 milliseconds
   5. Provide a justification (e.g., "Required for AI agent processing of complex analytical queries")
   6. Submit the request

   The quota increase is typically approved within a few minutes to 1 business day.

5. **Verify ECS Deployment**

   After deployment completes, verify the AgentCore Runtime containers are running:

   ```bash
   # Check ECS service status
   aws ecs describe-services \
     --cluster optira-agentcore-cluster \
     --services optira-agentcore-service \
     --region {AWS_REGION}

   # View container logs
   aws logs tail /ecs/optira-agentcore-runtime --follow
   ```

6. **Support Collector and Metadata Scheduler**
   We set the Support case collector scheduler to run every day at 06:00 (UTC) and the metadata refresh at 07:00 (UTC). Since this is for insights, it makes more sense to run it on a schedule rather than on-demand. If you would like to change this timing or run it more frequently, please modify the EventBridge scheduler.
   1. Support Case Collector - OptiraCollectorStack-OptiraCollectorDailySchedule-*
   2. Metadata Refresh - OptiraMetadataStack-OptiraMetadataDailySchedule-*

## Usage

### Query the Agent

The agents run as containerized services on ECS Fargate. Send POST requests via the API Gateway endpoint:

```json
{
  "query": "What is total count of RDS issues?"
}
```

### API Gateway Access

You can also access the agent via API Gateway. The API Gateway URL is provided in the CDK deployment output, and you'll need to retrieve the API key value:

```bash
# Get the API key value using the API key ID from deployment output
aws apigateway get-api-key --api-key <API-KEY-ID> --include-value --region us-west-2

# Example API call
curl -X POST \
  'https://your-api-gateway-url.execute-api.{AWS_REGION}.amazonaws.com/prod/prompt' \
  -H 'x-api-key: YOUR_API_KEY_VALUE' \
  -H 'Content-Type: application/json' \
  -d '{"query": "how many support cases entered, give me a breakdown year by year?"}'
```

**Note:** Replace the API Gateway URL with the value from your CDK deployment output (`ApiUrl`), and use the API key ID from the deployment output (`ProdApiKeyId`) to retrieve the actual API key value.

### Test Knowledge Base

```bash
cd es-optira-kb
python3 test_kb.py --region {AWS_REGION} --action query --kb-id {YOUR_KB_ID} --query-text "Your question"
```

## Features

- **AI-Powered Analysis**: Uses Amazon Bedrock for intelligent case analysis with Strands SDK
- **AgentCore Runtime**: Containerized deployment on ECS Fargate with zero cold starts and session isolation
- **Knowledge Base Integration**: Automated knowledge extraction from support cases using RAG
- **Case Aggregation**: Collects and processes AWS support case data across multiple accounts
- **Event Processing**: Real-time processing of support events with low-latency execution
- **Production-Grade Scalability**: Auto-scaling containerized agents (2-10 tasks) with ARM64 architecture
- **High Availability**: Multi-AZ deployment with Application Load Balancer
- **Long-Running Workflows**: Support for complex agent reasoning without Lambda's 15-minute limit

## Configuration

Key environment variables:

- `SYSTEM_PROMPT`: AI agent system prompt configuration
- `SupportDataBucket`: S3 bucket for storing support data
- `AthenaDatabaseName`: Athena database name for queries

## Monitoring

All components include CloudWatch logging and monitoring. Check the AWS Console for:

- **ECS Service**: Task count, CPU/Memory utilization, health status
- **Container Logs**: `/ecs/optira-agentcore-runtime` log group
- **Application Load Balancer**: Target health, request count, response times
- **API Gateway**: Request metrics, latency, error rates
- **CloudFormation**: Stack status and deployment events
- **S3 Bucket**: Support data contents
- **Bedrock Knowledge Base**: Ingestion and query status

**View real-time logs:**
```bash
aws logs tail /ecs/optira-agentcore-runtime --follow
```

## Cleanup

To remove all deployed resources:

```bash
# Destroy AgentCore Runtime stack (ECS, ALB, VPC, etc.)
cd es-optira && cdk destroy OptiraAgentCoreStack
cd ../es-optira-kb && cdk destroy
cd ../es-optira-collector && cdk destroy
cd ../es-optira-data-pipeline && cdk destroy
```

**Note:** If you need to manually clean up container images:
```bash
# Delete ECR repository and all images
aws ecr delete-repository --repository-name optira-agent-runtime --force --region {AWS_REGION}
```

## Manual Deployment

If you prefer to deploy components individually:

### 1. Build and Push Container Image (AgentCore Runtime)
```bash
cd es-optira
./build-and-push-image.sh
```

### 2. Data Collector
```bash
cd es-optira-collector
npm install
pip3 install -r requirements.txt
cdk deploy --parameters SupportDataBucket=your-bucket-name
```

### 3. Knowledge Base
```bash
cd es-optira-kb
pip3 install -r requirements.txt
cdk deploy --app "python3 kb_cdk.py your-bucket-name"
```

### 4. Data Pipeline
```bash
cd es-optira-data-pipeline
npm install
pip3 install -r requirements.txt
cdk deploy --parameters SupportDataBucket=your-bucket-name
```

### 5. AgentCore Runtime (Containerized Agents)
```bash
cd es-optira
npm install
pip3 install -r requirements.txt

# Deploy the AgentCore stack
cdk deploy OptiraAgentCoreStack --parameters SupportDataBucket=your-bucket-name
```

**For detailed AgentCore deployment instructions, troubleshooting, and scaling configuration, see:**
- [AGENTCORE_DEPLOYMENT.md](./es-optira/AGENTCORE_DEPLOYMENT.md) - Complete deployment guide

## Support

For issues and questions:
- **ECS/Container Issues**: Check `/ecs/optira-agentcore-runtime` CloudWatch logs
- **Deployment Issues**: Review CDK deployment outputs and CloudFormation stack events
- **Performance Tuning**: See AGENTCORE_DEPLOYMENT.md for scaling configuration
- Ensure all prerequisites are met (Docker, AWS CLI, CDK, appropriate permissions)
- For any support assistance, reach out to your AWS Technical Account Managers (TAMs)

## License

This project is licensed under the MIT License.