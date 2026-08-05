import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { object, string } from 'valibot';
import { resetAIState } from '../src/core';
import { deepseek, openrouter, omniRoute, openai, anthropic, google, groq, allGatewayProviders } from '../src/gateway';
import { defineProvider, configureAI, resolveModel, defineAgentTool } from '../src/index';

const originalEnv = process.env;

beforeEach(() => {
  resetAIState();
  process.env = { ...originalEnv };
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.UBEAN_AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.UBEAN_AI_API_BASE;
});

afterEach(() => {
  process.env = originalEnv;
});

describe('defineProvider() / resolveModel()', () => {
  it('注册 provider 后，`provider/model` 可解析为对应 provider + modelId', () => {
    defineProvider({ id: 'test-provider', kind: 'openai-compatible', baseURL: 'https://example.com/v1' });
    const resolved = resolveModel('test-provider/some-model');
    expect(resolved.provider.id).toBe('test-provider');
    expect(resolved.provider.baseURL).toBe('https://example.com/v1');
    expect(resolved.modelId).toBe('some-model');
  });

  it('provider 重复注册同 id 不报错，且后续注册覆盖（last wins）', () => {
    defineProvider({ id: 'dup', kind: 'openai-compatible', baseURL: 'https://a.com/v1' });
    defineProvider({ id: 'dup', kind: 'openai-compatible', baseURL: 'https://b.com/v1' });
    expect(resolveModel('dup/m').provider.baseURL).toBe('https://b.com/v1');
  });

  it('provider id 含 `/` 时不注册（仅模型名）', () => {
    defineProvider({ id: 'a/b', kind: 'openai-compatible', baseURL: 'https://x.com/v1' });
    // 未注册成功的 provider 应导致错误
    expect(() => resolveModel('a/b/m')).toThrow();
  });

  it('configureAI 设置默认 provider，无 provider 段的模型名走默认 provider', () => {
    defineProvider({ id: 'fallback', kind: 'openai-compatible', baseURL: 'https://fb.com/v1' });
    configureAI({ defaultProvider: 'fallback' });
    const resolved = resolveModel('bare-model');
    expect(resolved.provider.id).toBe('fallback');
    expect(resolved.modelId).toBe('bare-model');
  });

  it('无 provider 段且无默认/注册 provider 时，回退到 env provider（若配置了 key）', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-env';
    const resolved = resolveModel('bare-model');
    expect(resolved.provider.id).toBe('env');
    expect(resolved.modelId).toBe('bare-model');
  });

  it('无 provider 段且无默认/注册/env provider 时抛错', () => {
    expect(() => resolveModel('bare-model')).toThrow(/No provider resolved/);
  });

  it('provider 段存在但未注册，且无默认/注册 provider 时，回退到 env provider 并保留 modelId', () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    const resolved = resolveModel('unknown-provider/foo');
    expect(resolved.provider.id).toBe('env');
    expect(resolved.modelId).toBe('foo');
  });
});

describe('defineAgentTool()', () => {
  it('透传工具定义（类型安全的 identity）', () => {
    const tool = defineAgentTool({
      name: 'lookup',
      description: '查表',
      input: object({ key: string() }),
      execute: async ({ key }) => ({ key })
    });
    expect(tool.name).toBe('lookup');
    expect(tool.description).toBe('查表');
    expect(tool.input).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });
});

describe('gateway provider presets', () => {
  it('导出全部 7 个预设', () => {
    expect(allGatewayProviders).toHaveLength(7);
  });

  it('deepseek 默认 baseURL 为 api.deepseek.com/v1', () => {
    expect(deepseek.baseURL).toBe('https://api.deepseek.com/v1');
  });

  it('openrouter 默认 baseURL 为 openrouter.ai/api/v1', () => {
    expect(openrouter.baseURL).toBe('https://openrouter.ai/api/v1');
  });

  it('omniroute 默认 baseURL 为本地网关 localhost:8080/v1', () => {
    expect(omniRoute.baseURL).toBe('http://localhost:8080/v1');
  });

  it('openai 默认 baseURL 为 api.openai.com/v1', () => {
    expect(openai.baseURL).toBe('https://api.openai.com/v1');
  });

  it('anthropic / google / groq 预设均存在且为 openai-compatible', () => {
    expect(anthropic.kind).toBe('openai-compatible');
    expect(google.kind).toBe('openai-compatible');
    expect(groq.kind).toBe('openai-compatible');
  });

  it('每个预设 id 唯一', () => {
    const ids = allGatewayProviders.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
