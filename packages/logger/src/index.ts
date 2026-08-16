/**
 * @ubean/logger — 统一日志系统
 *
 * 基于 tslog@5,提供:
 * - `createUbeanLogger(options)` 创建命名 logger
 * - `getLogger(scope?)` 获取 scope 子 logger(继承父 logger settings)
 * - `logger` 全局默认实例
 */

export { createUbeanLogger, logger, getLogger } from './logger';
export type { UbeanLogger, UbeanLoggerOptions, LogLevelName, RequestLoggerOptions } from './types';
