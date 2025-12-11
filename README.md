This solution optimizes operational efficiencies through Agentic AI by delivering automated support case analysis. Built using the open-source Strands SDK from AWS, this solution provides complete flexibility and control over your AI implementation - you can use any LLM you prefer, whether it's Bedrock models, any model providers, or even local models like Ollama. You can extend this solution for your organization's needs.

The solution provides access through APIs or a web interface, featuring specialized agents that deliver distinct capabilities. The architecture leverages **AWS Bedrock AgentCore Runtime** with containerized agent deployment on Amazon ECS Fargate, providing session isolation, low-latency serverless execution optimized for AI agents, and production-grade scalability without cold starts. Most importantly, this is a 100% API-driven solution that can easily integrate with any platform you're already using, whether that's Slack or your own internal tools.

The Support Case Agent capability processes both structured and unstructured data from AWS support cases, performing numerical analysis using RAG and SQL agents for comprehensive operational insights. When dealing with support cases, the system handles two types of data: metadata (case ID, status, severity) for measurable statistical analysis, and conversation text for contextual understanding, providing both the story behind each case and statistical trends for data-driven decisions.

## Solution Architecture

The following diagram illustrates an organizational structure with multiple AWS accounts, where support cases from linked accounts are pulled into the organization's main account. 

![ALT](img/OrgDeploymentArchitecture.png)

The following diagram illustrates a multi-account structure with flexible AI agent orchestration. 

![ALT](img/optira-arch.png)

The architecture showcases modularity - you can add new agents or enhance existing ones without disrupting the overall flow. The implementation follows the [Agents as Tools](https://strandsagents.com/latest/documentation/docs/user-guide/concepts/multi-agent/agents-as-tools/) architecture pattern from Strands.

**Key Architectural Components:**

**Entry Points and Integration:**
- Users interact through web interface or directly via API calls
- All requests funnel through Amazon API Gateway with API key security
- 100% API-driven design enables integration with any platform (Slack, internal tools, etc.)

**AI Agent Orchestration:**
- API Gateway routes requests to containerized agents running on ECS Fargate via Application Load Balancer
- Agents deployed using AWS Bedrock AgentCore Runtime for session isolation and low-latency execution
- Orchestrator agent coordinates all specialized agents based on user prompts
- Two primary specialized agents for support cases:
  - **Numerical Analysis Agent**: Handles structured data queries using Athena SQL
  - **Knowledge Base Agent**: Processes unstructured data using RAG

**Data Flow and Processing:**
- Natural language queries are translated into precise Athena SQL via Bedrock LLM
- Support case metadata collected through AWS Support API
- Data stored in S3 and made queryable through Athena for unified multi-account view
- Orchestrator synthesizes responses from all agents into comprehensive answers

**Flexibility and Control:**
- Built on open-source [Strands SDK](https://strandsagents.com/latest/documentation/docs/) for complete customization
- LLM-agnostic design - use Bedrock, any model providers, or even [local models like Ollama](https://strandsagents.com/latest/documentation/docs/user-guide/concepts/model-providers/ollama/)
- Containerized AgentCore deployment on ECS Fargate with automatic scaling and ARM64 architecture support
- Modular design allows adding new capabilities without architectural changes

## AWS Bedrock AgentCore Runtime Benefits

This solution leverages **AWS Bedrock AgentCore Runtime** for containerized agent deployment, providing significant advantages over traditional serverless Lambda functions:

**Session Isolation and Security:**
- Each agent runs in a sandboxed container environment with isolated compute resources
- Real-time deterministic security controls via AgentCore Policy
- Enhanced security through network isolation and container-level permissions

**Low-Latency Serverless Execution:**
- Zero cold starts - containers are always warm and ready
- Optimized specifically for AI agent workloads
- Predictable, consistent response times for better user experience

**Support for Long-Running Agent Workflows:**
- No 15-minute execution time limits (unlike Lambda)
- Enables complex multi-step agent reasoning and analysis
- Better handling of extensive data processing and knowledge base queries

**Framework Flexibility:**
- Full compatibility with Strands SDK and open-source agent frameworks
- LLM-agnostic architecture supporting any model provider
- Easy local development and testing using standard Docker workflows

**Production-Grade Deployment at Scale:**
- **ECS Fargate**: Runs containerized agents with ARM64 architecture support
- **Application Load Balancer**: Distributes traffic across agent containers for high availability
- **Amazon ECR**: Secure container image storage with automated scanning
- **Auto-scaling**: Dynamically adjusts capacity based on CPU/memory utilization (2-10 tasks)
- **High Availability**: Minimum 2 tasks running across multiple availability zones

For detailed implementation steps, architectural details, and deployment procedures, see the [AgentCore Deployment Guide](./optira-core/es-optira/AGENTCORE_DEPLOYMENT.md).

The Data Collection Account refers to the central account that contains the support data in an S3 bucket after downloading from all accounts in scope. The Linked accounts refer to any accounts other than the Data Collection Account that have AWS support data - AWS support cases.

## Optira Components

This section outlines the key components of the Optira solution. 

### A. Optira Core

The solution has Optira Core that is deployed in a central Data Collection account using **AWS Bedrock AgentCore Runtime**. This contains core agents that can be deployed via CDK. It contains:
 - AI Agents powered by Amazon Bedrock and Strands SDK - running as containerized services on ECS Fargate in the central (Data Collection) account
 - Amazon Bedrock Knowledge Base for RAG-based unstructured data queries
 - API Gateway that provides RESTful endpoints for agent interactions
 - Application Load Balancer that distributes requests to containerized agent instances
 - Amazon ECR for secure container image storage
 - Extension to the Data Pipeline that updates metadata and Knowledge Base in the central account when the data collection S3 bucket is updated

The deployment process is detailed in the [Optira Core Deployment](./optira-core/README.md) guide, located in the `optira-core` subdirectory. This guide covers the steps to set up the required AWS resources. For specific AgentCore Runtime deployment details, see [AGENTCORE_DEPLOYMENT.md](./optira-core/es-optira/AGENTCORE_DEPLOYMENT.md).

### B. AWS Support Collector Module - Data Pipeline

The solution includes a data collection module to retrieve the necessary AWS support data.

The [Optira AWS Support Collection - Data Pipeline](./support_collector/README.md) guide, located in the `support_collector` subdirectory, outlines the steps to deploy the AWS Lambda functions and EventBridge resources required to collect and upload AWS Support Cases to an Amazon S3 bucket. This collected data can then be leveraged by Optira AI Agents to provide insights and remediations.

### C. Optira Web

Node.js React Web interface secured via Cognito. The architecture and deployment process is detailed in the [Optira Web Deployment](./optira-web/README.md) guide, located in the `optira-web` subdirectory. 

## Sample Output
Sample output using WebAPI and Web Application.
### A. Using WebAPI

![ALT](img/APISampleOutput.png)

### B. Using Web Application

![ALT](img/WebSampleOutput.png)

## Disclaimer

The code provided in this solution should be thoroughly tested and validated before deploying it in a production environment.

## Support

For technical questions and implementation guidance, please contact your AWS Technical Account Managers (TAMs) for specialized assistance with this solution. Support will be provided on a best-effort basis.

## License

This project is licensed under the MIT License.
