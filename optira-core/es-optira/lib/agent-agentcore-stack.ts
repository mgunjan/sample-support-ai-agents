import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';

export class OptiraAgentCoreStack extends Stack {
  public readonly agentEndpointUrl: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const supportDataBucketName = new cdk.CfnParameter(this, 'SupportDataBucket', {
      type: 'String',
      description: 'Name of the S3 bucket for support data'
    });

    const createNewBucket = new cdk.CfnParameter(this, 'CreateNewBucket', {
      type: 'String',
      default: 'true',
      allowedValues: ['true', 'false'],
      description: 'Create new S3 bucket (true) or use existing bucket (false)'
    });

    const enableWaf = new cdk.CfnParameter(this, 'EnableWAF', {
      type: 'String',
      default: 'false',
      allowedValues: ['true', 'false'],
      description: 'Enable AWS WAF for DDoS protection (true) or disable (false)'
    });

    // ============================================
    // AgentCore Runtime Container Infrastructure
    // ============================================

    // Create ECR repository for agent container images
    const agentRepository = new ecr.Repository(this, 'OptiraAgentRepository', {
      repositoryName: 'optira-agent-runtime',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
        },
      ],
    });

    // Create VPC for ECS cluster
    const vpc = new ec2.Vpc(this, 'OptiraAgentVPC', {
      maxAzs: 2,
      natGateways: 1,
    });

    // Create ECS cluster for AgentCore Runtime
    const cluster = new ecs.Cluster(this, 'OptiraAgentCluster', {
      vpc,
      clusterName: 'optira-agentcore-cluster',
      containerInsights: true,
    });

    // Create CloudWatch log group for agent container
    const logGroup = new logs.LogGroup(this, 'OptiraAgentLogGroup', {
      logGroupName: '/ecs/optira-agentcore-runtime',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create IAM role for ECS task execution (pulling images, writing logs)
    const executionRole = new iam.Role(this, 'OptiraAgentExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Grant ECR access to execution role
    agentRepository.grantPull(executionRole);

    // Create IAM role for ECS task (agent runtime permissions)
    const taskRole = new iam.Role(this, 'OptiraAgentTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'IAM role for Optira AgentCore Runtime with permissions for Bedrock, Athena, and other AWS services',
    });

    const knowledgeBaseSecret = secretsmanager.Secret.fromSecretNameV2(this, 'KnowledgeBaseSecret', 'optira/knowledge-base-id');

    // Add permissions for Bedrock APIs
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Retrieve"],
        resources: ["*"],
      }),
    );

    // Add Secrets Manager permissions
    knowledgeBaseSecret.grantRead(taskRole);

    // Add CloudWatch Logs permissions
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/ecs/optira-agentcore-runtime*`]
      })
    );

    // Add Athena permissions
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'athena:StartQueryExecution',
          'athena:GetQueryExecution',
          'athena:GetQueryResults',
          'athena:StopQueryExecution'
        ],
        resources: [
          `arn:aws:athena:${this.region}:${this.account}:workgroup/primary`,
          `arn:aws:athena:${this.region}:${this.account}:datacatalog/AwsDataCatalog`
        ]
      })
    );

    // Add Glue permissions for Athena metadata
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'glue:GetDatabase',
          'glue:GetTable',
          'glue:GetPartitions'
        ],
        resources: [
          `arn:aws:glue:${this.region}:${this.account}:catalog`,
          `arn:aws:glue:${this.region}:${this.account}:database/*`,
          `arn:aws:glue:${this.region}:${this.account}:table/*`
        ]
      })
    );

    // Add S3 permissions for Athena results
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetBucketLocation',
          's3:ListBucket'
        ],
        resources:  [
                `arn:aws:s3:::${supportDataBucketName.valueAsString}`
            ]
      })
    );

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject'
        ],
        resources: [
               `arn:aws:s3:::${supportDataBucketName.valueAsString}/*`
            ]
      })
    );

    // Add AWS Support API permissions for Trusted Advisor
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'support:DescribeTrustedAdvisorChecks',
          'support:DescribeTrustedAdvisorCheckResult',
          'support:DescribeTrustedAdvisorCheckSummaries',
           'support:RefreshTrustedAdvisorCheck'
        ],
        resources: ['*']
      })
    );

    // Add STS permissions for account ID resolution
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'sts:GetCallerIdentity'
        ],
        resources: ['*']
      })
    );

    // Create Fargate task definition for AgentCore Runtime
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'OptiraAgentTaskDef', {
      memoryLimitMiB: 8192,  // 8GB memory
      cpu: 4096,             // 4 vCPU
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,  // ARM64 for AgentCore Runtime
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      executionRole: executionRole,
      taskRole: taskRole,
    });

    // Add container to task definition
    const container = taskDefinition.addContainer('OptiraAgentContainer', {
      // NOTE: This image needs to be built and pushed to ECR manually before deployment
      // Use placeholder image initially, then update with actual image after build
      image: ecs.ContainerImage.fromEcrRepository(agentRepository, 'latest'),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'optira-agent',
        logGroup: logGroup,
      }),
      environment: {
        'ATHENA_DATABASE': 'optira_database',
        'ATHENA_OUTPUT_S3': `s3://${supportDataBucketName.valueAsString}/results/`,
        'BEDROCK_MODEL_ID': 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        'TRUSTED_ADVISOR_MODEL_ID': 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
        'KNOWLEDGEBASE_ID': knowledgeBaseSecret.secretValueFromJson('knowledge_base_id').unsafeUnwrap(),
        'MAX_PARALLEL_TOOLS': '3',
        'MAX_QUERY_EXECUTION_TIME': '300',
        'MAX_TOKENS': '2000',
        'SYSTEM_PROMPT': 'You are an enterprise support specialist, get the relevant asked information from the tools available to you SPECIALLY case_aggregation and knowledge_insight.',
        'AWS_DEFAULT_REGION': this.region,
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/2015-03-31/ping || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Map container port for agent invocation
    container.addPortMappings({
      containerPort: 8080,
      protocol: ecs.Protocol.TCP,
    });

    // Create Application Load Balancer for AgentCore Runtime
    const alb = new elbv2.ApplicationLoadBalancer(this, 'OptiraAgentALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'optira-agentcore-alb',
    });

    // Create target group for ECS service
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'OptiraAgentTargetGroup', {
      vpc,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/2015-03-31/ping',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Add listener to ALB
    const listener = alb.addListener('OptiraAgentListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    // Create ECS Fargate service for AgentCore Runtime
    const service = new ecs.FargateService(this, 'OptiraAgentService', {
      cluster,
      taskDefinition,
      desiredCount: 2,  // Run 2 tasks for high availability
      serviceName: 'optira-agentcore-service',
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
    });

    // Attach service to target group
    service.attachToApplicationTargetGroup(targetGroup);

    // Configure auto-scaling for the service
    const scaling = service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization('OptiraAgentCpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization('OptiraAgentMemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Store the ALB URL for API Gateway integration
    this.agentEndpointUrl = `http://${alb.loadBalancerDnsName}`;

    // ============================================
    // API Gateway Integration
    // ============================================

    // Create the API Gateway
    const api = new apigateway.RestApi(this, 'OptiraAgentApi', 
      {
      restApiName: 'OptiraAgent API',
      description: 'This is API Gateway service integrated with AgentCore Runtime backend',
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      },
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      cloudWatchRole: true,
    });

    // Create HTTP integration to AgentCore Runtime via ALB
    const agentIntegration = new apigateway.HttpIntegration(
      `${this.agentEndpointUrl}/2015-03-31/functions/function/invocations`,
      {
        httpMethod: 'POST',
        options: {
          connectionType: apigateway.ConnectionType.INTERNET,
          timeout: cdk.Duration.seconds(29), // API Gateway max timeout
          integrationResponses: [
            {
              statusCode: '200',
            },
            {
              statusCode: '400',
              selectionPattern: '4\\d{2}',
            },
            {
              statusCode: '500',
              selectionPattern: '5\\d{2}',
            },
          ],
        },
      }
    );

    // Create resources and methods
    const items = api.root.addResource('prompt');
    
    // POST method with HTTP integration
    items.addMethod('POST', agentIntegration, {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '500' },
      ],
      requestParameters: {
        'method.request.header.Content-Type': true,
      },
    });

    // Create a usage plan
    const plan = api.addUsagePlan('StandardUsagePlan', {
      name: 'Standard',
      description: 'Standard usage plan with rate limiting and quota',
      throttle: {
        rateLimit: 100,    // requests per second
        burstLimit: 500    // maximum concurrent requests
      },
      quota: {
        limit: 10000,     // number of requests
        period: apigateway.Period.MONTH
      }
    });

    // Create API keys
    const prodApiKey = api.addApiKey('ProdApiKey', {
      apiKeyName: 'optira-prod-api-key',
      description: 'API Key for production use'
    });

    plan.addApiKey(prodApiKey);

    // Associate the usage plan with the API's deployment stage
    plan.addApiStage({
      stage: api.deploymentStage
    });

    // Output the API URL and API key IDs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'ProdApiKeyId', {
      value: prodApiKey.keyId,
      description: 'Production API Key ID',
    });

    new cdk.CfnOutput(this, 'AgentCoreEndpoint', {
      value: this.agentEndpointUrl,
      description: 'AgentCore Runtime endpoint URL',
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: agentRepository.repositoryUri,
      description: 'ECR Repository URI for agent container images',
    });

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: cluster.clusterName,
      description: 'ECS Cluster name',
    });

    new cdk.CfnOutput(this, 'EcsServiceName', {
      value: service.serviceName,
      description: 'ECS Service name',
    });

    // Optional WAF for DDoS protection
    if (enableWaf.valueAsString === 'true') {
      const webAcl = new wafv2.CfnWebACL(this, 'OptiraApiWAF', {
        scope: 'REGIONAL',
        defaultAction: { allow: {} },
        rules: [
          {
            name: 'RateLimitRule',
            priority: 1,
            statement: {
              rateBasedStatement: {
                limit: 2000,
                aggregateKeyType: 'IP'
              }
            },
            action: { block: {} },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'RateLimitRule'
            }
          },
          {
            name: 'AWSManagedRulesCommonRuleSet',
            priority: 2,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet'
              }
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'CommonRuleSetMetric'
            }
          }
        ],
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: 'OptiraApiWAF'
        }
      });

      new wafv2.CfnWebACLAssociation(this, 'OptiraApiWAFAssociation', {
        resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${api.restApiId}/stages/prod`,
        webAclArn: webAcl.attrArn
      });

      new cdk.CfnOutput(this, 'WAFWebACLArn', {
        value: webAcl.attrArn,
        description: 'WAF Web ACL ARN'
      });
    }
  }
}
