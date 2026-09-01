import { Logger } from 'tslog';
import type { ILogObj, TLogLevel } from 'tslog';
import type { UbeanLogger, UbeanLoggerOptions } from './types';

const DEFAULT_NAME = 'ubean';

/**
 * 默认 pretty 模板:`HH:MM:SS\tLEVEL\tubean:<scope>\t<message>`。
 * 相比 tslog 默认:去掉毫秒与日期(本地时间足够)、去掉调用者文件路径+行号
 * (对 CLI 用户无意义且占宽),保留 logger 名作为前缀。
 */
const DEFAULT_PRETTY_TEMPLATE = '{{hh}}:{{MM}}:{{ss}}\t{{logLevelName}}\t{{nameWithDelimiterPrefix}}\t';

/** 未显式配置时的默认等级:info(debug/silly 需通过 LOG_LEVEL 打开) */
const DEFAULT_MIN_LEVEL = 'info';

/**
 * 从环境变量解析日志等级:
 * 1. `LOG_LEVEL`(ubean 约定,友好别名)
 * 2. `TSLOG_LEVEL`(tslog 原生)
 *
 * 返回 undefined 时沿用 tslog 默认 minLevel。
 */
function getLogLevelFromEnv(): TLogLevel | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const value = process.env.LOG_LEVEL ?? process.env.TSLOG_LEVEL;
  if (!value) return undefined;
  return value as TLogLevel;
}

/**
 * 创建一个 ubean 命名的 tslog logger(默认 name 为 `ubean`)。
 *
 * - 未显式提供 `minLevel` 时读取 `LOG_LEVEL`/`TSLOG_LEVEL` 环境变量,
 *   都没有则默认 `info`(debug/silly 需显式打开)
 * - pretty 输出使用精简模板(本地 `HH:MM:SS` + 等级 + logger 名,不含文件路径/行号),
 *   交互式终端彩色、管道/CI 自动去色;用户显式传 `pretty.template` 时不覆盖
 * - 需要结构化 JSON 时显式 `{ type: 'json' }` 或设 `TSLOG_TYPE=json`
 *
 * @example
 * ```ts
 * const log = createUbeanLogger({ name: 'api' });
 * log.info({ port: 3000 }, 'server started');
 * ```
 */
export function createUbeanLogger(options: UbeanLoggerOptions = {}): UbeanLogger {
  const minLevel = options.minLevel ?? getLogLevelFromEnv() ?? DEFAULT_MIN_LEVEL;
  return new Logger<ILogObj>({
    name: DEFAULT_NAME,
    ...options,
    pretty: { template: DEFAULT_PRETTY_TEMPLATE, timeZone: 'local', ...options.pretty },
    minLevel
  });
}

/** ubean 全局默认 logger(供应用侧 `import { logger } from 'ubean'` 使用) */
export const logger: UbeanLogger = createUbeanLogger();

/**
 * 获取命名(scope)logger。
 *
 * - 不传 scope 时返回全局默认 `logger`
 * - 传 scope 时返回其子 logger(name 组合为 `ubean:<scope>`,如 `getLogger('cli')` → `ubean:cli`),
 *   继承父 logger 的 settings/minLevel,可通过 `options` 覆盖
 *
 * @example
 * ```ts
 * const cli = getLogger('cli');
 * cli.info('building...');
 * ```
 */
export function getLogger(scope?: string, options: UbeanLoggerOptions = {}): UbeanLogger {
  if (!scope) return logger;
  return logger.getSubLogger({ name: scope, ...options });
}
