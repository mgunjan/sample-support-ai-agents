#!/bin/bash

# Build and Push Docker Image to ECR for Optira AgentCore Runtime
# This script builds the agent container image and pushes it to Amazon ECR

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Optira AgentCore Runtime - Build & Push${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)
if [ -z "$AWS_REGION" ]; then
    AWS_REGION="us-west-2"
    echo -e "${YELLOW}Warning: No default region found, using ${AWS_REGION}${NC}"
fi

# ECR Repository configuration
REPOSITORY_NAME="optira-agent-runtime"
IMAGE_TAG="${1:-latest}"  # Use first argument or default to 'latest'

# Full ECR repository URI
ECR_REPOSITORY_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPOSITORY_NAME}"

echo -e "${GREEN}Configuration:${NC}"
echo "  AWS Account ID: ${AWS_ACCOUNT_ID}"
echo "  AWS Region: ${AWS_REGION}"
echo "  Repository: ${REPOSITORY_NAME}"
echo "  Image Tag: ${IMAGE_TAG}"
echo "  ECR URI: ${ECR_REPOSITORY_URI}:${IMAGE_TAG}"
echo ""

# Authenticate Docker to ECR
echo -e "${GREEN}Step 1: Authenticating Docker to Amazon ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to authenticate to ECR${NC}"
    exit 1
fi

# Check if ECR repository exists, create if not
echo -e "${GREEN}Step 2: Checking ECR repository...${NC}"
aws ecr describe-repositories --repository-names ${REPOSITORY_NAME} --region ${AWS_REGION} > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Repository does not exist. Creating...${NC}"
    aws ecr create-repository \
        --repository-name ${REPOSITORY_NAME} \
        --image-scanning-configuration scanOnPush=true \
        --region ${AWS_REGION}
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to create ECR repository${NC}"
        exit 1
    fi
    echo -e "${GREEN}Repository created successfully${NC}"
else
    echo -e "${GREEN}Repository already exists${NC}"
fi

# Build Docker image for ARM64 architecture
echo -e "${GREEN}Step 3: Building Docker image for ARM64...${NC}"
cd lambda

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    echo -e "${RED}Error: Dockerfile not found in lambda directory${NC}"
    exit 1
fi

# Build the image with ARM64 architecture
docker build --platform linux/arm64 -t ${REPOSITORY_NAME}:${IMAGE_TAG} .

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}Docker image built successfully${NC}"

# Tag the image for ECR
echo -e "${GREEN}Step 4: Tagging Docker image...${NC}"
docker tag ${REPOSITORY_NAME}:${IMAGE_TAG} ${ECR_REPOSITORY_URI}:${IMAGE_TAG}

# Also tag as latest if not already
if [ "${IMAGE_TAG}" != "latest" ]; then
    docker tag ${REPOSITORY_NAME}:${IMAGE_TAG} ${ECR_REPOSITORY_URI}:latest
fi

# Push the image to ECR
echo -e "${GREEN}Step 5: Pushing Docker image to ECR...${NC}"
docker push ${ECR_REPOSITORY_URI}:${IMAGE_TAG}

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to push image to ECR${NC}"
    exit 1
fi

# Push latest tag if applicable
if [ "${IMAGE_TAG}" != "latest" ]; then
    docker push ${ECR_REPOSITORY_URI}:latest
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}SUCCESS!${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Image pushed to: ${ECR_REPOSITORY_URI}:${IMAGE_TAG}"
if [ "${IMAGE_TAG}" != "latest" ]; then
    echo "Also tagged as: ${ECR_REPOSITORY_URI}:latest"
fi
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Deploy or update your CDK stack: cdk deploy OptiraAgentCoreStack"
echo "2. Or update ECS service to use new image:"
echo "   aws ecs update-service --cluster optira-agentcore-cluster \\"
echo "       --service optira-agentcore-service --force-new-deployment \\"
echo "       --region ${AWS_REGION}"
echo ""
