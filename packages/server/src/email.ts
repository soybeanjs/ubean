/**
 * P9-25 邮件发送原语 —— Email sending primitives
 *
 * 内置邮件发送原语,提供 provider 抽象层。支持三种内置 provider:
 * - `log`   开发环境,将邮件内容输出到 console(或自定义 logger)
 * - `smtp`  生产环境,通过 nodemailer(可选 peer dependency)配置 SMTP/sendmail
 * - `mock`  测试环境,捕获发送的邮件以便断言
 *
 * 设计对齐 `storage.ts` 的 driver 抽象与 `queue.ts` 的全局 driver 注册模式:
 * - `defineEmailProvider(options)` 定义并注册一个 provider
 * - `createEmailTransport(provider)` 从 provider 配置创建 transport
 * - `sendEmail(options)` 使用全局默认 transport 发送邮件
 * - `renderEmailTemplate(template, data)` 简单字符串插值渲染
 *
 * 用法:
 * ```typescript
 * import { defineEmailProvider, sendEmail, renderEmailTemplate } from '@ubean/server';
 *
 * // 定义默认 provider(开发环境用 log)
 * defineEmailProvider({ type: 'log', default: true });
 *
 * // 发送邮件
 * await sendEmail({
 *   to: 'user@example.com',
 *   from: 'noreply@example.com',
 *   subject: 'Welcome',
 *   html: renderEmailTemplate('<h1>Hello {{name}}</h1>', { name: 'Alice' }),
 *   text: 'Hello Alice'
 * });
 * ```
 */

/* -------------------------------------------------------------------------- */
/* 类型定义                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 邮件附件
 */
export interface EmailAttachment {
  filename: string;
  content: string | Buffer | Uint8Array;
  contentType?: string;
  /** 当 content 为字符串时的编码方式(如 'base64') */
  encoding?: string;
  /** 内联附件的 content-id(用于在 HTML 中引用) */
  cid?: string;
}

/**
 * 发送邮件选项
 */
export interface EmailOptions {
  to: string | string[];
  from: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}

/**
 * 发送邮件结果
 */
export interface EmailResult {
  messageId: string;
  response?: string;
  provider: string;
}

/**
 * 邮件传输层接口
 */
export interface EmailTransport {
  send(options: EmailOptions): Promise<EmailResult>;
  verify?(): Promise<boolean>;
  close?(): Promise<void>;
}

/**
 * Mock transport —— 额外暴露已发送邮件列表,用于测试断言
 */
export interface MockEmailTransport extends EmailTransport {
  readonly sent: EmailOptions[];
  clear(): void;
}

export type EmailProviderType = 'log' | 'smtp' | 'mock' | 'sendmail';

/**
 * Log provider 配置(开发环境)
 */
export interface LogEmailProviderConfig {
  type: 'log';
  logger?: (message: string) => void;
}

/**
 * SMTP provider 配置(生产环境,nodemailer)
 */
export interface SmtpEmailProviderConfig {
  type: 'smtp';
  host: string;
  port: number;
  secure?: boolean;
  auth?: { user: string; pass: string };
  /** 透传给 nodemailer 的额外选项 */
  extra?: Record<string, unknown>;
}

/**
 * Mock provider 配置(测试环境)
 */
export interface MockEmailProviderConfig {
  type: 'mock';
}

/**
 * Sendmail provider 配置(本地 sendmail 命令)
 */
export interface SendmailEmailProviderConfig {
  type: 'sendmail';
  path?: string;
  args?: string[];
}

/**
 * provider 配置联合类型(判别联合,以 `type` 字段区分)
 */
export type EmailProviderConfig =
  | LogEmailProviderConfig
  | SmtpEmailProviderConfig
  | MockEmailProviderConfig
  | SendmailEmailProviderConfig;

/**
 * `defineEmailProvider` 的选项 —— 在 provider 配置基础上增加 `name` 和 `default`
 */
export type DefineEmailProviderOptions = EmailProviderConfig & {
  name?: string;
  default?: boolean;
};

/**
 * 邮件 provider 定义
 */
export interface EmailProvider {
  readonly type: EmailProviderType;
  readonly name?: string;
  readonly config: EmailProviderConfig;
}

/* -------------------------------------------------------------------------- */
/* 内部工具                                                                     */
/* -------------------------------------------------------------------------- */

function generateMessageId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function joinRecipients(to: string | string[]): string {
  return Array.isArray(to) ? to.join(', ') : to;
}

/**
 * 从对象中按点号路径读取嵌套值
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/* -------------------------------------------------------------------------- */
/* Transport 工厂                                                              */
/* -------------------------------------------------------------------------- */

function createLogTransport(config: LogEmailProviderConfig): EmailTransport {
  const logger = config.logger || ((msg: string) => console.log(msg));
  return {
    async send(options: EmailOptions): Promise<EmailResult> {
      const lines: string[] = [
        `[ubean-email] ${options.subject}`,
        `  From: ${options.from}`,
        `  To: ${joinRecipients(options.to)}`
      ];
      if (options.cc) lines.push(`  Cc: ${joinRecipients(options.cc)}`);
      if (options.bcc) lines.push(`  Bcc: ${joinRecipients(options.bcc)}`);
      if (options.replyTo) lines.push(`  Reply-To: ${options.replyTo}`);
      if (options.text) lines.push(`  Text: ${options.text}`);
      if (options.html) {
        const preview = options.html.length > 100 ? `${options.html.slice(0, 100)}...` : options.html;
        lines.push(`  HTML: ${preview}`);
      }
      if (options.attachments && options.attachments.length > 0) {
        lines.push(`  Attachments: ${options.attachments.map(a => a.filename).join(', ')}`);
      }
      logger(lines.join('\n'));
      return { messageId: generateMessageId('log'), provider: 'log' };
    },
    async verify(): Promise<boolean> {
      return true;
    }
  };
}

function createMockTransport(_config: MockEmailProviderConfig): MockEmailTransport {
  const sent: EmailOptions[] = [];
  return {
    sent,
    clear(): void {
      sent.length = 0;
    },
    async send(options: EmailOptions): Promise<EmailResult> {
      sent.push(options);
      return { messageId: generateMessageId('mock'), provider: 'mock' };
    },
    async verify(): Promise<boolean> {
      return true;
    }
  };
}

function createSmtpTransport(config: SmtpEmailProviderConfig): EmailTransport {
  let nodemailerTransport: { sendMail: Function; verify: Function; close: Function } | null = null;

  async function getNodemailerTransport(): Promise<{
    sendMail: Function;
    verify: Function;
    close: Function;
  }> {
    if (nodemailerTransport) return nodemailerTransport;
    let nodemailer: { createTransport: (opts: Record<string, unknown>) => unknown };
    try {
      // 使用变量阻止 TypeScript 静态解析可选 peer 依赖(nodemailer 未安装时不报错)
      const moduleName = 'nodemailer';
      nodemailer = await import(moduleName);
    } catch {
      throw new Error('[ubean] nodemailer is not installed. Install it with: pnpm add nodemailer');
    }
    nodemailerTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      ...config.extra
    }) as { sendMail: Function; verify: Function; close: Function };
    return nodemailerTransport;
  }

  return {
    async send(options: EmailOptions): Promise<EmailResult> {
      const t = await getNodemailerTransport();
      const result = (await t.sendMail({
        from: options.from,
        to: joinRecipients(options.to),
        cc: options.cc ? joinRecipients(options.cc) : undefined,
        bcc: options.bcc ? joinRecipients(options.bcc) : undefined,
        replyTo: options.replyTo,
        subject: options.subject,
        text: options.text,
        html: options.html,
        headers: options.headers,
        attachments: options.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          encoding: a.encoding,
          cid: a.cid
        }))
      })) as { messageId: string; response: string };
      return { messageId: result.messageId, response: result.response, provider: 'smtp' };
    },
    async verify(): Promise<boolean> {
      const t = await getNodemailerTransport();
      return t.verify() as Promise<boolean>;
    },
    async close(): Promise<void> {
      if (nodemailerTransport) {
        nodemailerTransport.close();
        nodemailerTransport = null;
      }
    }
  };
}

function createSendmailTransport(config: SendmailEmailProviderConfig): EmailTransport {
  let nodemailerTransport: { sendMail: Function; close: Function } | null = null;

  async function getNodemailerTransport(): Promise<{ sendMail: Function; close: Function }> {
    if (nodemailerTransport) return nodemailerTransport;
    let nodemailer: { createTransport: (opts: Record<string, unknown>) => unknown };
    try {
      // 使用变量阻止 TypeScript 静态解析可选 peer 依赖(nodemailer 未安装时不报错)
      const moduleName = 'nodemailer';
      nodemailer = await import(moduleName);
    } catch {
      throw new Error('[ubean] nodemailer is not installed. Install it with: pnpm add nodemailer');
    }
    nodemailerTransport = nodemailer.createTransport({
      sendmail: true,
      path: config.path || '/usr/sbin/sendmail',
      args: config.args || ['-i']
    }) as { sendMail: Function; close: Function };
    return nodemailerTransport;
  }

  return {
    async send(options: EmailOptions): Promise<EmailResult> {
      const t = await getNodemailerTransport();
      const result = (await t.sendMail({
        from: options.from,
        to: joinRecipients(options.to),
        cc: options.cc ? joinRecipients(options.cc) : undefined,
        bcc: options.bcc ? joinRecipients(options.bcc) : undefined,
        replyTo: options.replyTo,
        subject: options.subject,
        text: options.text,
        html: options.html,
        headers: options.headers,
        attachments: options.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          encoding: a.encoding,
          cid: a.cid
        }))
      })) as { messageId: string; response: string };
      return { messageId: result.messageId, response: result.response, provider: 'sendmail' };
    },
    async close(): Promise<void> {
      if (nodemailerTransport) {
        nodemailerTransport.close();
        nodemailerTransport = null;
      }
    }
  };
}

/* -------------------------------------------------------------------------- */
/* 全局 provider 注册表                                                         */
/* -------------------------------------------------------------------------- */

const providerRegistry = new Map<string, EmailProvider>();
let globalProvider: EmailProvider | null = null;
let globalTransport: EmailTransport | null = null;

/**
 * 定义并注册一个邮件 provider
 *
 * @example
 * ```typescript
 * // 开发环境
 * defineEmailProvider({ type: 'log', default: true });
 *
 * // 生产环境
 * defineEmailProvider({
 *   type: 'smtp',
 *   name: 'primary',
 *   default: true,
 *   host: 'smtp.example.com',
 *   port: 587,
 *   auth: { user: 'postmaster', pass: 'secret' }
 * });
 * ```
 */
export function defineEmailProvider(options: DefineEmailProviderOptions): EmailProvider {
  const { name, default: isDefault, ...config } = options;
  const provider: EmailProvider = {
    type: config.type,
    name,
    config: config as EmailProviderConfig
  };

  if (name) {
    providerRegistry.set(name, provider);
  }
  if (isDefault) {
    setDefaultEmailProvider(provider);
  }
  return provider;
}

/**
 * 从 provider 配置创建 transport
 */
export function createEmailTransport(provider: EmailProvider): EmailTransport {
  switch (provider.config.type) {
    case 'log':
      return createLogTransport(provider.config);
    case 'mock':
      return createMockTransport(provider.config);
    case 'smtp':
      return createSmtpTransport(provider.config);
    case 'sendmail':
      return createSendmailTransport(provider.config);
    default: {
      const exhaustive: never = provider.config;
      throw new Error(`[ubean] Unknown email provider type: ${(exhaustive as EmailProviderConfig).type}`);
    }
  }
}

/**
 * 设置全局默认 provider(并立即创建其 transport)
 */
export function setDefaultEmailProvider(provider: EmailProvider): void {
  globalProvider = provider;
  globalTransport = createEmailTransport(provider);
}

/**
 * 获取全局默认 provider。若尚未设置,则惰性创建一个 `log` provider。
 */
export function useEmailProvider(): EmailProvider {
  if (!globalProvider) {
    globalProvider = defineEmailProvider({ type: 'log' });
    globalTransport = createEmailTransport(globalProvider);
  }
  return globalProvider;
}

/**
 * 获取全局默认 transport。若尚未设置,则惰性创建一个 `log` transport。
 */
export function getEmailTransport(): EmailTransport {
  if (!globalTransport) {
    useEmailProvider();
  }
  return globalTransport as EmailTransport;
}

/**
 * 按名称获取已注册的 provider
 */
export function getEmailProvider(name: string): EmailProvider | undefined {
  return providerRegistry.get(name);
}

/**
 * 获取所有已注册的 provider 名称
 */
export function getEmailProviderNames(): string[] {
  return Array.from(providerRegistry.keys());
}

/**
 * 使用全局默认 transport 发送邮件
 *
 * @example
 * ```typescript
 * await sendEmail({
 *   to: 'user@example.com',
 *   from: 'noreply@example.com',
 *   subject: 'Welcome',
 *   html: '<h1>Welcome!</h1>',
 *   text: 'Welcome!'
 * });
 * ```
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (!options.to) throw new Error('[ubean] sendEmail: "to" is required');
  if (!options.from) throw new Error('[ubean] sendEmail: "from" is required');
  if (!options.subject) throw new Error('[ubean] sendEmail: "subject" is required');

  const transport = getEmailTransport();
  return transport.send(options);
}

/**
 * 简单模板渲染 —— `{{key}}` 字符串插值,支持点号嵌套路径
 *
 * @example
 * ```typescript
 * renderEmailTemplate('Hello {{user.name}}, your code is {{code}}', {
 *   user: { name: 'Alice' },
 *   code: '123456'
 * });
 * // => 'Hello Alice, your code is 123456'
 * ```
 */
export function renderEmailTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => {
    const value = getNestedValue(data, key.trim());
    return value !== undefined && value !== null ? String(value) : '';
  });
}

/* -------------------------------------------------------------------------- */
/* Mock 辅助函数(测试用)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 获取全局 mock transport 捕获的已发送邮件。
 * 若全局 transport 不是 mock,则返回空数组。
 */
export function getSentEmails(): EmailOptions[] {
  if (globalTransport && 'sent' in globalTransport) {
    return (globalTransport as MockEmailTransport).sent;
  }
  return [];
}

/**
 * 清空全局 mock transport 捕获的已发送邮件。
 * 若全局 transport 不是 mock,则不做任何操作。
 */
export function clearSentEmails(): void {
  if (globalTransport && 'sent' in globalTransport) {
    (globalTransport as MockEmailTransport).clear();
  }
}

/**
 * 清除所有 provider 注册表与全局状态(主要用于测试隔离)
 */
export function clearEmailProviders(): void {
  providerRegistry.clear();
  globalProvider = null;
  globalTransport = null;
}
