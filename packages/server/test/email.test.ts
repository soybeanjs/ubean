/**
 * P9-25 邮件发送原语 —— 单元测试
 *
 * 覆盖:
 * - defineEmailProvider 定义/注册/默认设置
 * - createEmailTransport 创建 log/mock/smtp/sendmail transport
 * - sendEmail 全局默认 transport 发送(含字段校验)
 * - renderEmailTemplate 字符串插值(简单/嵌套/缺失/多占位符)
 * - Mock transport 捕获与 getSentEmails/clearSentEmails
 * - Log transport 自定义 logger
 * - 全局注册表清理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  defineEmailProvider,
  createEmailTransport,
  setDefaultEmailProvider,
  useEmailProvider,
  getEmailTransport,
  getEmailProvider,
  getEmailProviderNames,
  sendEmail,
  renderEmailTemplate,
  getSentEmails,
  clearSentEmails,
  clearEmailProviders
} from '../src/index';
import type { EmailProvider, MockEmailTransport } from '../src/index';

/* -------------------------------------------------------------------------- */
/* 测试隔离:每个 describe 前清理全局状态                                         */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  clearEmailProviders();
});

/* -------------------------------------------------------------------------- */
/* defineEmailProvider                                                          */
/* -------------------------------------------------------------------------- */

describe('P9-25: defineEmailProvider', () => {
  it('defines a log provider', () => {
    const provider = defineEmailProvider({ type: 'log' });
    expect(provider.type).toBe('log');
    expect(provider.config.type).toBe('log');
  });

  it('defines a mock provider', () => {
    const provider = defineEmailProvider({ type: 'mock' });
    expect(provider.type).toBe('mock');
  });

  it('registers provider by name in the registry', () => {
    defineEmailProvider({ type: 'log', name: 'dev-logger' });
    const provider = getEmailProvider('dev-logger');
    expect(provider).toBeDefined();
    expect(provider!.type).toBe('log');
  });

  it('sets provider as default when default: true', () => {
    const provider = defineEmailProvider({ type: 'mock', default: true });
    expect(useEmailProvider()).toBe(provider);
  });

  it('lists all registered provider names', () => {
    defineEmailProvider({ type: 'log', name: 'a' });
    defineEmailProvider({ type: 'mock', name: 'b' });
    expect(getEmailProviderNames().sort()).toEqual(['a', 'b']);
  });
});

/* -------------------------------------------------------------------------- */
/* createEmailTransport                                                         */
/* -------------------------------------------------------------------------- */

describe('P9-25: createEmailTransport', () => {
  it('creates a log transport from provider', () => {
    const provider = defineEmailProvider({ type: 'log' });
    const transport = createEmailTransport(provider);
    expect(typeof transport.send).toBe('function');
  });

  it('creates a mock transport that captures sent emails', async () => {
    const provider = defineEmailProvider({ type: 'mock' });
    const transport = createEmailTransport(provider) as MockEmailTransport;
    expect(transport.sent).toEqual([]);

    await transport.send({
      to: 'alice@example.com',
      from: 'noreply@example.com',
      subject: 'Hi',
      text: 'Hello'
    });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].to).toBe('alice@example.com');
  });

  it('mock transport clear() resets captured emails', async () => {
    const provider = defineEmailProvider({ type: 'mock' });
    const transport = createEmailTransport(provider) as MockEmailTransport;
    await transport.send({ to: 'a@x.com', from: 'b@x.com', subject: 's' });
    expect(transport.sent).toHaveLength(1);
    transport.clear();
    expect(transport.sent).toHaveLength(0);
  });

  it('creates an smtp transport without throwing (lazy import)', () => {
    const provider = defineEmailProvider({
      type: 'smtp',
      host: 'smtp.example.com',
      port: 587
    });
    // Should not throw on creation (nodemailer import is deferred to send)
    const transport = createEmailTransport(provider);
    expect(typeof transport.send).toBe('function');
  });

  it('returns EmailResult with messageId and provider name', async () => {
    const provider = defineEmailProvider({ type: 'mock' });
    const transport = createEmailTransport(provider);
    const result = await transport.send({
      to: 'x@x.com',
      from: 'y@x.com',
      subject: 'test'
    });
    expect(result.messageId).toBeTruthy();
    expect(result.provider).toBe('mock');
  });
});

/* -------------------------------------------------------------------------- */
/* sendEmail (global default transport)                                         */
/* -------------------------------------------------------------------------- */

describe('P9-25: sendEmail', () => {
  it('sends via the global default transport', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    const result = await sendEmail({
      to: 'user@example.com',
      from: 'noreply@example.com',
      subject: 'Welcome',
      text: 'Hello!'
    });
    expect(result.provider).toBe('mock');
    expect(result.messageId).toBeTruthy();
  });

  it('defaults to a log provider when no default is set', async () => {
    const provider = useEmailProvider();
    expect(provider.type).toBe('log');
    const result = await sendEmail({
      to: 'u@x.com',
      from: 'n@x.com',
      subject: 's'
    });
    expect(result.provider).toBe('log');
  });

  it('supports HTML and text fallback simultaneously', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    await sendEmail({
      to: 'u@x.com',
      from: 'n@x.com',
      subject: 's',
      html: '<h1>Hi</h1>',
      text: 'Hi'
    });
    const sent = getSentEmails();
    expect(sent[0].html).toBe('<h1>Hi</h1>');
    expect(sent[0].text).toBe('Hi');
  });

  it('supports attachments', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    await sendEmail({
      to: 'u@x.com',
      from: 'n@x.com',
      subject: 's',
      attachments: [
        { filename: 'report.pdf', content: Buffer.from('fake-pdf'), contentType: 'application/pdf' },
        { filename: 'note.txt', content: 'hello', contentType: 'text/plain' }
      ]
    });
    const sent = getSentEmails();
    expect(sent[0].attachments).toHaveLength(2);
    expect(sent[0].attachments![0].filename).toBe('report.pdf');
    expect(sent[0].attachments![1].filename).toBe('note.txt');
  });

  it('supports multiple recipients (array form)', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    await sendEmail({
      to: ['alice@x.com', 'bob@x.com'],
      from: 'n@x.com',
      subject: 's'
    });
    const sent = getSentEmails();
    expect(sent[0].to).toEqual(['alice@x.com', 'bob@x.com']);
  });

  it('supports cc and bcc', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    await sendEmail({
      to: 'to@x.com',
      from: 'n@x.com',
      subject: 's',
      cc: 'cc@x.com',
      bcc: 'bcc@x.com'
    });
    const sent = getSentEmails();
    expect(sent[0].cc).toBe('cc@x.com');
    expect(sent[0].bcc).toBe('bcc@x.com');
  });

  it('throws when "to" is missing', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    await expect(sendEmail({ to: '', from: 'n@x.com', subject: 's' })).rejects.toThrow('"to" is required');
  });

  it('throws when "from" is missing', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    await expect(sendEmail({ to: 'u@x.com', from: '', subject: 's' })).rejects.toThrow('"from" is required');
  });

  it('throws when "subject" is missing', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    await expect(sendEmail({ to: 'u@x.com', from: 'n@x.com', subject: '' })).rejects.toThrow('"subject" is required');
  });
});

/* -------------------------------------------------------------------------- */
/* renderEmailTemplate                                                          */
/* -------------------------------------------------------------------------- */

describe('P9-25: renderEmailTemplate', () => {
  it('interpolates simple values', () => {
    const result = renderEmailTemplate('Hello {{name}}!', { name: 'Alice' });
    expect(result).toBe('Hello Alice!');
  });

  it('interpolates nested values via dot notation', () => {
    const result = renderEmailTemplate('Hi {{user.name}}, code: {{user.code}}', {
      user: { name: 'Bob', code: '42' }
    });
    expect(result).toBe('Hi Bob, code: 42');
  });

  it('replaces missing keys with empty string', () => {
    const result = renderEmailTemplate('Hello {{name}}!', {});
    expect(result).toBe('Hello !');
  });

  it('handles multiple placeholders in one template', () => {
    const result = renderEmailTemplate('{{greeting}} {{name}}, your order #{{orderId}} is {{status}}.', {
      greeting: 'Hi',
      name: 'Carol',
      orderId: 12345,
      status: 'shipped'
    });
    expect(result).toBe('Hi Carol, your order #12345 is shipped.');
  });

  it('handles whitespace inside placeholders', () => {
    const result = renderEmailTemplate('Hello {{  name  }}!', { name: 'Dave' });
    expect(result).toBe('Hello Dave!');
  });

  it('leaves plain text unchanged when no placeholders', () => {
    expect(renderEmailTemplate('no placeholders here', {})).toBe('no placeholders here');
  });

  it('converts non-string values to string', () => {
    const result = renderEmailTemplate('count={{n}} active={{a}}', { n: 42, a: true });
    expect(result).toBe('count=42 active=true');
  });
});

/* -------------------------------------------------------------------------- */
/* Mock 辅助函数: getSentEmails / clearSentEmails                                */
/* -------------------------------------------------------------------------- */

describe('P9-25: mock capture helpers', () => {
  it('getSentEmails returns emails sent via global mock transport', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    await sendEmail({ to: 'a@x.com', from: 'n@x.com', subject: '1' });
    await sendEmail({ to: 'b@x.com', from: 'n@x.com', subject: '2' });
    expect(getSentEmails()).toHaveLength(2);
    expect(getSentEmails()[0].subject).toBe('1');
    expect(getSentEmails()[1].subject).toBe('2');
  });

  it('clearSentEmails resets the captured emails', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    await sendEmail({ to: 'a@x.com', from: 'n@x.com', subject: '1' });
    expect(getSentEmails()).toHaveLength(1);
    clearSentEmails();
    expect(getSentEmails()).toHaveLength(0);
  });

  it('getSentEmails returns empty array when global transport is not mock', async () => {
    defineEmailProvider({ type: 'log', default: true });
    await sendEmail({ to: 'a@x.com', from: 'n@x.com', subject: '1' });
    expect(getSentEmails()).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Log transport —— 自定义 logger                                               */
/* -------------------------------------------------------------------------- */

describe('P9-25: log provider with custom logger', () => {
  it('invokes custom logger with email details', async () => {
    const logger = vi.fn();
    const provider = defineEmailProvider({ type: 'log', logger });
    const transport = createEmailTransport(provider);
    await transport.send({
      to: 'alice@example.com',
      from: 'noreply@example.com',
      subject: 'Welcome Alice',
      text: 'Hello Alice'
    });
    expect(logger).toHaveBeenCalledTimes(1);
    const logged = logger.mock.calls[0][0] as string;
    expect(logged).toContain('Welcome Alice');
    expect(logged).toContain('alice@example.com');
    expect(logged).toContain('noreply@example.com');
  });

  it('logs attachment filenames', async () => {
    const logger = vi.fn();
    const provider = defineEmailProvider({ type: 'log', logger });
    const transport = createEmailTransport(provider);
    await transport.send({
      to: 'a@x.com',
      from: 'n@x.com',
      subject: 's',
      attachments: [{ filename: 'doc.pdf', content: Buffer.from('x') }]
    });
    const logged = logger.mock.calls[0][0] as string;
    expect(logged).toContain('doc.pdf');
  });
});

/* -------------------------------------------------------------------------- */
/* 全局注册表: setDefaultEmailProvider / clearEmailProviders                     */
/* -------------------------------------------------------------------------- */

describe('P9-25: global registry', () => {
  it('setDefaultEmailProvider replaces the default transport', async () => {
    defineEmailProvider({ type: 'log', default: true });
    const mockProvider = defineEmailProvider({ type: 'mock' });
    setDefaultEmailProvider(mockProvider);

    await sendEmail({ to: 'a@x.com', from: 'n@x.com', subject: 's' });
    expect(getSentEmails()).toHaveLength(1);
  });

  it('getEmailTransport returns the current global transport', () => {
    defineEmailProvider({ type: 'mock', default: true });
    const transport = getEmailTransport();
    expect('sent' in transport).toBe(true);
  });

  it('clearEmailProviders resets the registry and global state', () => {
    defineEmailProvider({ type: 'log', name: 'a' });
    defineEmailProvider({ type: 'mock', default: true });
    expect(getEmailProviderNames()).toHaveLength(1);
    expect(useEmailProvider().type).toBe('mock');

    clearEmailProviders();
    expect(getEmailProviderNames()).toHaveLength(0);
    // After clear, useEmailProvider lazily creates a new log provider
    expect(useEmailProvider().type).toBe('log');
  });

  it('getEmailProvider returns undefined for unknown name', () => {
    expect(getEmailProvider('nonexistent')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* 集成: renderEmailTemplate + sendEmail                                         */
/* -------------------------------------------------------------------------- */

describe('P9-25: integration (template + send)', () => {
  it('renders a template and sends the email', async () => {
    defineEmailProvider({ type: 'mock', default: true });
    const html = renderEmailTemplate('<h1>Welcome {{user.name}}</h1><p>Your code: {{code}}</p>', {
      user: { name: 'Eve' },
      code: '999999'
    });
    const text = renderEmailTemplate('Welcome {{user.name}}, code: {{code}}', {
      user: { name: 'Eve' },
      code: '999999'
    });
    await sendEmail({
      to: 'eve@example.com',
      from: 'noreply@example.com',
      subject: 'Welcome to ubean',
      html,
      text
    });
    const sent = getSentEmails()[0];
    expect(sent.html).toBe('<h1>Welcome Eve</h1><p>Your code: 999999</p>');
    expect(sent.text).toBe('Welcome Eve, code: 999999');
  });
});

/* -------------------------------------------------------------------------- */
/* SMTP transport —— 在 nodemailer 未安装时的错误处理                            */
/* -------------------------------------------------------------------------- */

describe('P9-25: smtp transport (without nodemailer)', () => {
  it('throws a helpful error on send when nodemailer is not installed', async () => {
    // 仅当 nodemailer 未安装时验证错误信息;若已安装则跳过该断言
    let nodemailerAvailable = false;
    try {
      await import('nodemailer');
      nodemailerAvailable = true;
    } catch {
      nodemailerAvailable = false;
    }

    if (nodemailerAvailable) {
      // nodemailer 已安装,无法测试缺失场景,跳过
      return;
    }

    const provider: EmailProvider = {
      type: 'smtp',
      config: { type: 'smtp', host: 'smtp.example.com', port: 587 }
    };
    const transport = createEmailTransport(provider);
    await expect(transport.send({ to: 'a@x.com', from: 'n@x.com', subject: 's' })).rejects.toThrow(
      'nodemailer is not installed'
    );
  });
});
