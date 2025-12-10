#!/bin/bash

# Configure Web Interface for AgentCore Runtime
# This script updates the .env file to use AgentCore Runtime endpoint

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Configure Optira Web for AgentCore${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Get stack outputs
STACK_NAME="${1:-OptiraAgentCoreStack}"
echo -e "${GREEN}Fetching configuration from stack: ${STACK_NAME}${NC}"

# Get API URL
API_URL=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text 2>/dev/null)

if [ -z "$API_URL" ]; then
    echo -e "${RED}Error: Could not find stack ${STACK_NAME}${NC}"
    echo -e "${YELLOW}Usage: $0 [stack-name]${NC}"
    echo -e "${YELLOW}Default stack name: OptiraAgentCoreStack${NC}"
    exit 1
fi

# Get API Key ID
API_KEY_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`ProdApiKeyId`].OutputValue' \
  --output text)

# Get API Key value
API_KEY=$(aws apigateway get-api-key \
  --api-key ${API_KEY_ID} \
  --include-value \
  --query 'value' \
  --output text)

# Get region
AWS_REGION=$(aws configure get region)
if [ -z "$AWS_REGION" ]; then
    AWS_REGION="us-west-2"
fi

# Backup existing .env if it exists
if [ -f .env ]; then
    echo -e "${YELLOW}Backing up existing .env to .env.backup${NC}"
    cp .env .env.backup
fi

# Create new .env file
cat > .env << EOF
# Optira Web Interface Configuration
# Generated automatically for AgentCore Runtime

# API Gateway endpoint (AgentCore Runtime)
OPTIRA_API_ENDPOINT=${API_URL}prompt
OPTIRA_API_KEY=${API_KEY}

# Runtime mode (true for AgentCore, false for Lambda)
USE_AGENTCORE_RUNTIME=true

# AWS Configuration
REACT_APP_AWS_REGION=${AWS_REGION}

# Server Configuration
SERVER_PORT=3001
NODE_ENV=development

# Generated on: $(date)
# Stack: ${STACK_NAME}
EOF

echo -e "${GREEN}✓ Configuration file created: .env${NC}"
echo ""
echo -e "${GREEN}Configuration Summary:${NC}"
echo "  API Endpoint: ${API_URL}prompt"
echo "  API Key: ${API_KEY:0:10}..."
echo "  Region: ${AWS_REGION}"
echo "  Runtime Mode: AgentCore Runtime"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review the .env file if needed"
echo "2. Start the web server:"
echo "   npm start"
echo ""
echo "3. Test the interface at:"
echo "   http://localhost:3000"
echo ""

# Test the endpoint
echo -e "${GREEN}Testing API endpoint...${NC}"
TEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST ${API_URL}prompt \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d '{"query":"test"}' 2>&1 || echo "000")

HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✓ API endpoint is responding${NC}"
elif [ "$HTTP_CODE" == "400" ] || [ "$HTTP_CODE" == "500" ]; then
    echo -e "${YELLOW}⚠ API endpoint responded with code: ${HTTP_CODE}${NC}"
    echo -e "${YELLOW}  This may be normal - check CloudWatch logs if needed${NC}"
else
    echo -e "${RED}✗ Could not connect to API endpoint${NC}"
    echo -e "${YELLOW}  Response code: ${HTTP_CODE}${NC}"
    echo -e "${YELLOW}  Check that ECS tasks are running:${NC}"
    echo "    aws ecs describe-services --cluster optira-agentcore-cluster --services optira-agentcore-service"
fi
