/**
 * dev server 日志分类闸门 —— logDiagnostics 的 'auto' 语义单元测试。
 *
 * 健康时静默("All capability checks passed" 仅 verbose 输出),
 * 告警/错误属于 warn/error 级别,始终输出。
 *
 * 捕获方式:tslog 子 logger 在创建时拷贝父级 transports,因此先给根 logger
 * 挂 transport,再动态 import dev-server 模块(其 `getLogger('dev-server')`
 * 子实例即可继承捕获)。
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { CapabilityDiagnosisResult } from '@ubean/preset';
import { logger } from '@ubean/shared/logger';

type CaptureRecord = {
  1?: string;
  [key: number]: unknown;
  _logMeta?: { logLevelName: string; name?: string };
};

const records: CaptureRecord[] = [];

logger.attachTransport({
  name: 'capture',
  write: record => {
    records.push(record as CaptureRecord);
  }
});

const { logDiagnostics } = await import('../src/dev-server');

function allPassed(): CapabilityDiagnosisResult {
  return { valid: true, diagnostics: [], errors: [], warnings: [], presetName: 'node' };
}

function withWarnings(): CapabilityDiagnosisResult {
  return {
    valid: true,
    diagnostics: [{ capability: 'cronTriggers', supported: false, required: false, message: 'not supported here' }],
    errors: [],
    warnings: [],
    presetName: 'cloudflare'
  };
}

describe('logDiagnostics auto semantics', () => {
  afterEach(() => {
    records.length = 0;
  });

  function messagesAt(level: string): string[] {
    // transport record 按参数索引展开:单字符串调用消息位于索引 0(fields-first 调用才占 0/1 两位)
    return records.filter(r => r._logMeta?.logLevelName === level).map(r => String(r[1] ?? r[0]));
  }

  it('healthy + default(auto) → 完全静默', () => {
    logDiagnostics(allPassed());
    expect(records).toHaveLength(0);
  });

  it('healthy + verbose → 输出 All capability checks passed', () => {
    logDiagnostics(allPassed(), { verbose: true });
    expect(messagesAt('INFO')).toEqual(['All capability checks passed']);
  });

  it('有告警时无论 verbose 与否都输出 warn', () => {
    logDiagnostics(withWarnings());
    expect(messagesAt('WARN').join('\n')).toContain('cronTriggers');

    records.length = 0;
    logDiagnostics(withWarnings(), { verbose: true });
    expect(messagesAt('WARN').join('\n')).toContain('cronTriggers');
  });
});
