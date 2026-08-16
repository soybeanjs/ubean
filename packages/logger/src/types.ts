import type { ILogObj, ISettingsParam, Logger } from 'tslog';

/**
 * 日志等级名称(与 tslog v5 默认等级表一致)。
 * 仅用于类型标注;`minLevel` 实际接受 number / tslog LogLevel 枚举 / 大小写不敏感的名称。
 */
export type LogLevelName = 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** 由 @ubean/logger 创建的 tslog 实例 */
export type UbeanLogger = Logger<ILogObj>;

/**
 * ubean logger 选项 —— 透传 tslog v5 分组 settings(type/pretty/json/mask/stack/meta/…)。
 * 约定:未显式提供 `minLevel` 时,由 `LOG_LEVEL`/`TSLOG_LEVEL` 环境变量决定(见 {@link createUbeanLogger})。
 */
export interface UbeanLoggerOptions extends ISettingsParam<ILogObj> {}

/**
 * `createRequestLoggerMiddleware` 选项。
 */
export interface RequestLoggerOptions {
  /**
   * 用于输出请求日志的 logger;默认 `getLogger('http')`(name 为 `ubean:http`)。
   */
  logger?: UbeanLogger;
  /**
   * 跳过的路径:
   * - glob 模式字符串(如 `'/_health'`、`'/api/**'`、`'/favicon.ico'`)
   * - RegExp(如 `/^\/_/`)
   * - 或自定义谓词 `(path) => boolean`
   */
  exclude?: Array<string | RegExp> | ((path: string) => boolean);
  /**
   * 超过该毫秒数的请求以 `warn` 记录(用于慢请求告警)。默认 `1000`。
   */
  slowThreshold?: number;
  /**
   * 记录完整 URL(含 query string)而非仅 path。默认 `false`。
   */
  logQuery?: boolean;
}
