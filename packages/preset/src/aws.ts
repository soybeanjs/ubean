import { createCapabilitySet } from './capabilities';
import { definePreset } from './registry';

/**
 * AWS 能力矩阵
 *
 * AWS Lambda(Node.js 运行时)有冷启动,不支持 WebSocket / 持久连接,
 * 但支持 EventBridge 定时规则(cron)、SQS 队列、S3 存储、DynamoDB 等。
 * 通过 API Gateway / Function URL 暴露 HTTP 端点。
 */
const AWS_CAPABILITIES = createCapabilitySet({
  staticServe: true, // 通过 CloudFront / S3 提供静态文件
  websocket: false, // Lambda 不支持 WebSocket(需 API Gateway WebSocket API)
  sse: true,
  cronTriggers: true, // EventBridge 定时规则
  queues: true, // SQS
  kv: true, // DynamoDB
  storage: true, // S3
  database: true, // RDS / DynamoDB
  envVars: true,
  secrets: true, // AWS Secrets Manager
  nodeCompat: true,
  streaming: true, // Lambda 响应流(较新特性)
  compression: true, // CloudFront 压缩
  https: true,
  http2: true, // CloudFront HTTP/2
  middleware: false,
  bodyLimit: true,
  multipart: true,
  rpc: false
});

/**
 * AWS Lambda preset —— AWS Lambda + API Gateway / Function URL 模式
 *
 * 构建输出:`dist/aws/lambda/index.mjs`(Lambda handler)
 * 预览命令:`sam local start-api`(通过 AWS SAM 本地模拟)
 * 部署命令:`sam deploy --guided`(交互式部署)
 *
 * Lambda handler 签名:
 * ```typescript
 * export const handler = async (event, context) => { ... };
 * ```
 */
export const awsPreset = definePreset(
  {
    extends: 'node',
    capabilities: AWS_CAPABILITIES,
    entry: 'server',
    exportConditions: ['aws', 'aws-lambda'],
    build: {
      outputDir: 'dist/aws',
      format: 'esm',
      externals: ['hono', 'c12', 'citty', 'consola', 'defu', 'hookable', 'pathe', 'ufo', 'zod', '@aws-sdk/*']
    },
    output: {
      dir: 'dist/aws',
      serverDir: 'dist/aws/lambda',
      publicDir: 'dist/aws/public'
    },
    runtime: {
      entry: 'lambda/index.mjs',
      handler: 'handler',
      compatibilityDate: '2024-09-01'
    },
    serve: {
      host: 'localhost',
      port: 3001
    },
    commands: {
      preview: 'sam local start-api',
      deploy: 'sam deploy --guided'
    },
    hooks: {
      'build:before': async () => {},
      'build:after': async () => {}
    }
  },
  {
    name: 'aws',
    aliases: ['aws-lambda', 'lambda', 'amazon', 'sam'],
    stdName: 'aws_lambda',
    dev: true,
    compatibilityDate: '2024-09-01',
    url: 'https://docs.aws.amazon.com/lambda/latest/dg/welcome.html'
  }
);

/**
 * AWS SAM 配置文件(`template.yaml`)类型(简化版)
 *
 * 完整规范见:https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-specification.html
 */
export interface AwsSamTemplate {
  AWSTemplateFormatVersion?: string;
  Transform?: string;
  Description?: string;
  Resources: Record<string, AwsSamResource>;
  Outputs?: Record<
    string,
    { Description?: string; Value: string | Record<string, unknown>; Export?: { Name: string } }
  >;
  Parameters?: Record<string, { Type: string; Default?: string; Description?: string }>;
  Globals?: {
    Function?: {
      Runtime?: string;
      MemorySize?: number;
      Timeout?: number;
      Environment?: { Variables?: Record<string, string> };
      Handler?: string;
    };
  };
}

export interface AwsSamResource {
  Type: string;
  Properties: {
    FunctionName?: string;
    Handler?: string;
    Runtime?: string;
    CodeUri?: string;
    MemorySize?: number;
    Timeout?: number;
    Environment?: { Variables?: Record<string, string> };
    Events?: Record<string, { Type: string; Properties: Record<string, unknown> }>;
    Policies?: string[];
    AutoPublishAlias?: string;
    DeploymentPreference?: { Type: string };
    /** 各 SAM 资源类型有不同属性(如 ApiGateway 的 StageName),允许扩展 */
    [key: string]: unknown;
  };
}

/**
 * 生成 AWS SAM template.yaml 配置对象
 */
export function generateAwsSamConfig(options: {
  functionName?: string;
  handler?: string;
  runtime?: string;
  codeUri?: string;
  memorySize?: number;
  timeout?: number;
  environment?: Record<string, string>;
  apiStage?: string;
  cronSchedules?: Array<{ name: string; schedule: string; enabled?: boolean }>;
}): AwsSamTemplate {
  const handler = options.handler || 'dist/aws/lambda/index.handler';
  const runtime = options.runtime || 'nodejs20.x';
  const codeUri = options.codeUri || 'dist/aws/lambda';

  const events: Record<string, { Type: string; Properties: Record<string, unknown> }> = {
    ApiEvent: {
      Type: 'Api',
      Properties: {
        Path: '/{proxy+}',
        Method: 'ANY',
        RestApiId: { Ref: 'ApiGateway' }
      }
    }
  };

  // 添加 EventBridge 定时规则
  if (options.cronSchedules) {
    for (const cron of options.cronSchedules) {
      events[`Cron${cron.name}`] = {
        Type: 'Schedule',
        Properties: {
          Schedule: cron.schedule,
          Enabled: cron.enabled ?? true,
          Name: cron.name
        }
      };
    }
  }

  const template: AwsSamTemplate = {
    AWSTemplateFormatVersion: '2010-09-09',
    Transform: 'AWS::Serverless-2016-10-31',
    Description: 'ubean application deployed to AWS Lambda',
    Globals: {
      Function: {
        Runtime: runtime,
        MemorySize: options.memorySize ?? 256,
        Timeout: options.timeout ?? 30,
        Handler: handler
      }
    },
    Resources: {
      ApiGateway: {
        Type: 'AWS::Serverless::Api',
        Properties: {
          StageName: options.apiStage || 'prod',
          EndpointConfiguration: { Type: 'REGIONAL' }
        }
      },
      UbeanFunction: {
        Type: 'AWS::Serverless::Function',
        Properties: {
          FunctionName: options.functionName || 'ubean-app',
          Handler: handler,
          Runtime: runtime,
          CodeUri: codeUri,
          MemorySize: options.memorySize ?? 256,
          Timeout: options.timeout ?? 30,
          Events: events,
          Policies: ['AmazonDynamoDBReadOnlyAccess', 'AmazonS3ReadOnlyAccess']
        }
      }
    },
    Outputs: {
      ApiUrl: {
        Description: 'URL of the API endpoint',
        Value: {
          'Fn::Sub': `https://\${ApiGateway}.execute-api.\${AWS::Region}.amazonaws.com/${options.apiStage || 'prod'}`
        }
      },
      FunctionArn: {
        Description: 'ARN of the Lambda function',
        Value: { 'Fn::GetAtt': ['UbeanFunction', 'Arn'] }
      }
    }
  };

  if (options.environment && Object.keys(options.environment).length > 0) {
    template.Resources.UbeanFunction.Properties.Environment = { Variables: options.environment };
  }

  return template;
}

/**
 * 序列化 AWS SAM template 为 YAML 字符串
 */
export function serializeAwsSamConfig(template: AwsSamTemplate): string {
  return serializeYaml(template, 0);
}

function serializeYaml(value: unknown, indent: number): string {
  const pad = '  '.repeat(indent);

  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    // 特殊处理 AWS CloudFormation 内置函数
    if (value.startsWith('Fn::') || value.startsWith('AWS::')) {
      return value;
    }
    if (/^[\w./-]+$/.test(value) && !value.includes(' ')) {
      return value;
    }
    return `"${escapeYamlString(value)}"`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map(item => `${pad}- ${serializeYaml(item, indent + 1).trimStart()}`).join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) return '{}';

    return entries
      .map(([key, val]) => {
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          const nested = serializeYaml(val, indent + 1);
          if (nested === '{}') return `${pad}${key}: {}`;
          return `${pad}${key}:\n${nested}`;
        }
        if (Array.isArray(val) && val.length > 0) {
          const items = val
            .map(item => {
              if (item !== null && typeof item === 'object') {
                const nested = serializeYaml(item, indent + 2).trimStart();
                return `${pad}  - ${nested}`;
              }
              return `${pad}  - ${serializeYaml(item, 0)}`;
            })
            .join('\n');
          return `${pad}${key}:\n${items}`;
        }
        return `${pad}${key}: ${serializeYaml(val, 0)}`;
      })
      .join('\n');
  }

  return String(value);
}

function escapeYamlString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
