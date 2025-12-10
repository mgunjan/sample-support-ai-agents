# Use AWS Lambda Python 3.12 base image for ARM64 architecture
# This ensures compatibility with AgentCore Runtime on ARM64
FROM public.ecr.aws/lambda/python:3.12-arm64

# Set working directory
WORKDIR /var/task

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all agent code and tools
COPY lambda_function.py .
COPY bedrockAPI.py .
COPY caseAggregationTool.py .
COPY knowledgeBaseTool.py .
COPY queryExecutor.py .

# Set environment variables (these will be overridden at runtime)
ENV PYTHONUNBUFFERED=1
ENV AWS_DEFAULT_REGION=us-west-2

# Expose port for AgentCore Runtime health checks
EXPOSE 8080

# Lambda runtime interface emulator is built into the base image
# For AgentCore Runtime, the entry point remains the same
CMD [ "lambda_function.lambda_handler" ]
