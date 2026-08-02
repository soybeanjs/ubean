/**
 * Task 16 —— AWS / Azure 平台预设单元测试
 *
 * 覆盖:
 * - AWS Lambda preset 配置与能力矩阵
 * - Azure Static Web Apps preset 配置与能力矩阵
 * - AWS SAM / Azure SWA 配置文件生成与序列化
 * - 自动检测 (environment)
 * - 注册表与别名解析
 */
import { describe, it, expect } from 'vitest';
import {
  awsPreset,
  azurePreset,
  resolvePresetByName,
  detectPreset,
  listDetectablePresets,
  getRegisteredPresets,
  getPresetAliases,
  generateAwsSamConfig,
  serializeAwsSamConfig,
  generateStaticWebAppConfig,
  serializeStaticWebAppConfig
} from '../src';

/* -------------------------------------------------------------------------- */
/* AWS preset                                                                 */
/* -------------------------------------------------------------------------- */

describe('awsPreset', () => {
  it('has correct name', () => {
    expect(awsPreset.name).toBe('aws');
  });

  it('extends node preset', () => {
    expect(awsPreset.extends).toBe('node');
  });

  it('has correct aliases', () => {
    expect(awsPreset._meta.aliases).toContain('aws-lambda');
    expect(awsPreset._meta.aliases).toContain('lambda');
    expect(awsPreset._meta.aliases).toContain('amazon');
    expect(awsPreset._meta.aliases).toContain('sam');
  });

  it('has serverless capabilities (no websocket, has nodeCompat, has cronTriggers, has queues)', () => {
    expect(awsPreset.capabilities?.websocket).toBe(false);
    expect(awsPreset.capabilities?.nodeCompat).toBe(true);
    expect(awsPreset.capabilities?.cronTriggers).toBe(true);
    expect(awsPreset.capabilities?.queues).toBe(true);
  });

  it('has AWS dev/deploy commands', () => {
    expect(awsPreset.commands?.preview).toContain('sam local start-api');
    expect(awsPreset.commands?.deploy).toContain('sam deploy');
  });

  it('uses port 3001', () => {
    expect(awsPreset.serve?.port).toBe(3001);
  });

  it('resolves by name and aliases', () => {
    expect(resolvePresetByName('aws').name).toBe('aws');
    expect(resolvePresetByName('lambda').name).toBe('aws');
    expect(resolvePresetByName('aws-lambda').name).toBe('aws');
    expect(resolvePresetByName('sam').name).toBe('aws');
  });
});

/* -------------------------------------------------------------------------- */
/* Azure preset                                                               */
/* -------------------------------------------------------------------------- */

describe('azurePreset', () => {
  it('has correct name', () => {
    expect(azurePreset.name).toBe('azure');
  });

  it('extends node preset', () => {
    expect(azurePreset.extends).toBe('node');
  });

  it('has correct aliases', () => {
    expect(azurePreset._meta.aliases).toContain('azure-swa');
    expect(azurePreset._meta.aliases).toContain('swa');
    expect(azurePreset._meta.aliases).toContain('azure-functions');
  });

  it('has serverless capabilities (no websocket, has nodeCompat, has cronTriggers)', () => {
    expect(azurePreset.capabilities?.websocket).toBe(false);
    expect(azurePreset.capabilities?.nodeCompat).toBe(true);
    expect(azurePreset.capabilities?.cronTriggers).toBe(true);
  });

  it('has Azure dev/deploy commands', () => {
    expect(azurePreset.commands?.preview).toContain('swa start');
    expect(azurePreset.commands?.deploy).toContain('swa deploy');
  });

  it('uses port 4280 (Azure SWA CLI default)', () => {
    expect(azurePreset.serve?.port).toBe(4280);
  });

  it('resolves by name and aliases', () => {
    expect(resolvePresetByName('azure').name).toBe('azure');
    expect(resolvePresetByName('swa').name).toBe('azure');
    expect(resolvePresetByName('azure-swa').name).toBe('azure');
    expect(resolvePresetByName('azure-functions').name).toBe('azure');
  });
});

/* -------------------------------------------------------------------------- */
/* Config generation                                                          */
/* -------------------------------------------------------------------------- */

describe('generateAwsSamConfig', () => {
  it('generates a valid SAM template', () => {
    const template = generateAwsSamConfig({});
    expect(template.AWSTemplateFormatVersion).toBe('2010-09-09');
    expect(template.Transform).toBe('AWS::Serverless-2016-10-31');
    expect(template.Resources).toBeDefined();
    expect(template.Outputs).toBeDefined();
  });

  it('includes cron schedules when provided', () => {
    const template = generateAwsSamConfig({
      cronSchedules: [{ name: 'cleanup', schedule: 'rate(1 hour)', enabled: true }]
    });
    const events = template.Resources.UbeanFunction.Properties.Events;
    expect(events.Croncleanup).toBeDefined();
    expect(events.Croncleanup.Type).toBe('Schedule');
    expect(events.Croncleanup.Properties.Schedule).toBe('rate(1 hour)');
  });
});

describe('serializeAwsSamConfig', () => {
  it('serializes to YAML string containing key fields', () => {
    const template = generateAwsSamConfig({ functionName: 'ubean-test' });
    const yaml = serializeAwsSamConfig(template);
    expect(typeof yaml).toBe('string');
    expect(yaml).toContain('AWSTemplateFormatVersion');
    expect(yaml).toContain('Transform');
    expect(yaml).toContain('Resources');
    expect(yaml).toContain('Outputs');
  });
});

describe('generateStaticWebAppConfig', () => {
  it('generates a valid config with routes and navigationFallback', () => {
    const config = generateStaticWebAppConfig({});
    expect(config.routes).toBeDefined();
    expect(config.routes!.length).toBeGreaterThan(0);
    expect(config.navigationFallback).toBeDefined();
    expect(config.navigationFallback?.rewrite).toBe('/index.html');
  });
});

describe('serializeStaticWebAppConfig', () => {
  it('serializes to JSON string', () => {
    const config = generateStaticWebAppConfig({});
    const json = serializeStaticWebAppConfig(config);
    expect(typeof json).toBe('string');
    expect(json).toContain('"routes"');
    expect(json).toContain('"navigationFallback"');
  });
});

/* -------------------------------------------------------------------------- */
/* Detection                                                                  */
/* -------------------------------------------------------------------------- */

describe('detectPreset - AWS & Azure', () => {
  it('detects AWS via AWS_LAMBDA_FUNCTION_NAME env var', () => {
    const result = detectPreset({
      environment: { AWS_LAMBDA_FUNCTION_NAME: 'ubean-fn' },
      globalThis: {}
    });
    expect(result.preset.name).toBe('aws');
    expect(result.source).toBe('environment');
  });

  it('detects Azure via AZURE_FUNCTIONS_ENVIRONMENT env var', () => {
    const result = detectPreset({
      environment: { AZURE_FUNCTIONS_ENVIRONMENT: 'Development' },
      globalThis: {}
    });
    expect(result.preset.name).toBe('azure');
    expect(result.source).toBe('environment');
  });

  it('listDetectablePresets includes aws and azure', () => {
    const list = listDetectablePresets();
    const names = list.map(p => p.name);
    expect(names).toContain('aws');
    expect(names).toContain('azure');
  });
});

/* -------------------------------------------------------------------------- */
/* Registration & aliases                                                     */
/* -------------------------------------------------------------------------- */

describe('registration & aliases (aws & azure)', () => {
  it('AWS and Azure presets are registered', () => {
    const names = getRegisteredPresets().map(p => p.name);
    expect(names).toContain('aws');
    expect(names).toContain('azure');
  });

  it('aliases map correctly', () => {
    const aliases = getPresetAliases();
    expect(aliases.get('aws-lambda')).toBe('aws');
    expect(aliases.get('lambda')).toBe('aws');
    expect(aliases.get('sam')).toBe('aws');
    expect(aliases.get('swa')).toBe('azure');
    expect(aliases.get('azure-swa')).toBe('azure');
    expect(aliases.get('azure-functions')).toBe('azure');
  });

  it('listDetectablePresets has at least 11 entries now', () => {
    const list = listDetectablePresets();
    expect(list.length).toBeGreaterThanOrEqual(11);
  });
});
