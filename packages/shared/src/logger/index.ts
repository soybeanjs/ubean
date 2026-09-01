/**
 * `@ubean/shared/logger` — 统一日志（tslog@5）。
 *
 * 不从 `@ubean/shared` 主入口 re-export，避免浏览器安全 barrel 拉入 tslog。
 */
export { createUbeanLogger, logger, getLogger, setDebugLogging } from './logger';
export type { UbeanLogger, UbeanLoggerOptions, LogLevelName, RequestLoggerOptions } from './types';
