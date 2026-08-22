import { Logger } from 'tslog';
import type { ILogObj, TLogLevel } from 'tslog';
import type { UbeanLogger, UbeanLoggerOptions } from './types';

const DEFAULT_NAME = 'ubean';

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
 * - 未显式提供 `minLevel` 时读取 `LOG_LEVEL`/`TSLOG_LEVEL` 环境变量
 * - 输出格式沿用 tslog 默认:交互式终端彩色 pretty,管道/CI 自动去色;需要结构化 JSON 时显式
 *   `{ type: 'json' }` 或设 `TSLOG_TYPE=json`
 *
 * @example
 * ```ts
 * const log = createUbeanLogger({ name: 'api' });
 * log.info({ port: 3000 }, 'server started');
 * ```
 */
export function createUbeanLogger(options: UbeanLoggerOptions = {}): UbeanLogger {
  const minLevel = options.minLevel ?? getLogLevelFromEnv();
  return new Logger<ILogObj>({
    name: DEFAULT_NAME,
    ...options,
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
