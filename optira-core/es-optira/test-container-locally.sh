#!/bin/bash

# Test Optira Agent Container Locally
# This script helps test the agent container before deploying to AWS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Optira Agent - Local Container Test${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Configuration
IMAGE_NAME="optira-agent-runtime"
CONTAINER_NAME="optira-agent-test"
IMAGE_TAG="${1:-latest}"

echo -e "${GREEN}Configuration:${NC}"
echo "  Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "  Container: ${CONTAINER_NAME}"
echo ""

# Build the image if it doesn't exist
echo -e "${GREEN}Step 1: Building Docker image...${NC}"
cd lambda

if [ ! -f "Dockerfile" ]; then
    echo -e "${RED}Error: Dockerfile not found${NC}"
    exit 1
fi

docker build --platform linux/arm64 -t ${IMAGE_NAME}:${IMAGE_TAG} .

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}Image built successfully${NC}"
cd ..

# Stop and remove existing container if running
echo -e "${GREEN}Step 2: Cleaning up existing containers...${NC}"
docker rm -f ${CONTAINER_NAME} 2>/dev/null || true

# Set up environment variables for local testing
echo -e "${GREEN}Step 3: Setting up environment variables...${NC}"
cat > .env.test << EOF
# AWS Configuration (uses local AWS credentials)
AWS_DEFAULT_REGION=${AWS_REGION:-us-west-2}
AWS_REGION=${AWS_REGION:-us-west-2}

# Agent Configuration
ATHENA_DATABASE=optira_database
ATHENA_OUTPUT_S3=s3://your-support-data-bucket/results/
BEDROCK_MODEL_ID=us.anthropic.claude-3-7-sonnet-20250219-v1:0
TRUSTED_ADVISOR_MODEL_ID=us.anthropic.claude-3-7-sonnet-20250219-v1:0
KNOWLEDGEBASE_ID=your-knowledge-base-id
MAX_PARALLEL_TOOLS=3
MAX_QUERY_EXECUTION_TIME=300
MAX_TOKENS=2000
SYSTEM_PROMPT=You are an enterprise support specialist, get the relevant asked information from the tools available to you SPECIALLY case_aggregation and knowledge_insight.
EOF

echo -e "${YELLOW}Note: Update .env.test with your actual AWS resource IDs${NC}"

# Run the container
echo -e "${GREEN}Step 4: Starting container...${NC}"
docker run -d \
  --name ${CONTAINER_NAME} \
  --platform linux/arm64 \
  --env-file .env.test \
  -v ~/.aws:/root/.aws:ro \
  -p 9000:8080 \
  ${IMAGE_NAME}:${IMAGE_TAG}

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to start container${NC}"
    exit 1
fi

echo -e "${GREEN}Container started successfully${NC}"

# Wait for container to be ready
echo -e "${GREEN}Step 5: Waiting for container to be ready...${NC}"
sleep 5

# Check container status
CONTAINER_STATUS=$(docker inspect -f '{{.State.Status}}' ${CONTAINER_NAME})
if [ "${CONTAINER_STATUS}" != "running" ]; then
    echo -e "${RED}Error: Container is not running${NC}"
    echo -e "${YELLOW}Container logs:${NC}"
    docker logs ${CONTAINER_NAME}
    exit 1
fi

# Check health
echo -e "${GREEN}Step 6: Checking container health...${NC}"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:9000/2015-03-31/ping || echo "000")
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)

if [ "${HEALTH_CODE}" == "200" ]; then
    echo -e "${GREEN}✓ Container is healthy${NC}"
else
    echo -e "${YELLOW}⚠ Health check returned code: ${HEALTH_CODE}${NC}"
    echo -e "${YELLOW}This may be normal for Lambda Runtime Interface Emulator${NC}"
fi

# Test invocation
echo -e "${GREEN}Step 7: Testing agent invocation...${NC}"
cat > test-event.json << 'EOF'
{
  "body": "{\"query\":\"How many support cases do we have in total?\"}"
}
EOF

echo -e "${YELLOW}Sending test request...${NC}"
RESPONSE=$(curl -s -X POST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -H "Content-Type: application/json" \
  -d @test-event.json)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Request sent successfully${NC}"
    echo -e "${GREEN}Response:${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    echo -e "${RED}✗ Request failed${NC}"
fi

# Show container logs
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Container Logs:${NC}"
echo -e "${GREEN}========================================${NC}"
docker logs ${CONTAINER_NAME}

# Instructions
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test Complete${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Container is running. You can:${NC}"
echo ""
echo "1. View logs in real-time:"
echo "   docker logs -f ${CONTAINER_NAME}"
echo ""
echo "2. Test with custom query:"
echo "   curl -X POST http://localhost:9000/2015-03-31/functions/function/invocations \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"body\":\"{\\\"query\\\":\\\"your query here\\\"}\"}'"
echo ""
echo "3. Execute commands inside container:"
echo "   docker exec -it ${CONTAINER_NAME} /bin/bash"
echo ""
echo "4. Stop container:"
echo "   docker stop ${CONTAINER_NAME}"
echo ""
echo "5. Remove container:"
echo "   docker rm ${CONTAINER_NAME}"
echo ""
echo -e "${YELLOW}Note: Make sure you have valid AWS credentials configured${NC}"
echo -e "${YELLOW}      and the required AWS resources (Athena, Bedrock, etc.)${NC}"
