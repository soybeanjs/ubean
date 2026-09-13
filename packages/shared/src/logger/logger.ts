import { Logger } from 'tslog';
import type { ILogObj, TLogLevel, TLogLevelName } from 'tslog';
import type { UbeanLogger, UbeanLoggerOptions, LogLevelName } from './types';

const DEFAULT_NAME = 'ubean';

/**
 * 默认精简模板:空模板 → 仅输出消息(无日期 / 等级 / 路径),适合 CLI 日常使用。
 * 需要完整上下文(日期 + 调用位置 + logger 名)时,用 `setDebugLogging(true)` 切换。
 */
const DEFAULT_PRETTY_TEMPLATE = '';

/**
 * debug 模式的详细模板:日期 + 等级 + 调用位置 + logger 名 + 消息。
 * 仅在显式开启 debug 日志时使用(见 {@link setDebugLogging})。
 */
const DEBUG_PRETTY_TEMPLATE =
  '{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}\t{{logLevelName}}\t{{filePathWithLine}}\t{{nameWithDelimiterPrefix}}\t';

/** 未显式配置时的默认等级:info(debug/silly 需通过 LOG_LEVEL 打开) */
const DEFAULT_MIN_LEVEL: TLogLevel = 'INFO';

/** 是否处于 debug 模式(输出详细模板) */
let debugMode = false;

/**
 * 配置文件显式指定的日志级别(`logging.level`,归一化为大写)。
 * 优先级:logger 显式 `minLevel` > 此配置 > `LOG_LEVEL`/`TSLOG_LEVEL` 环境变量 > `info`。
 */
let configuredMinLevel: TLogLevelName | undefined;

/** 已创建的 logger 实例注册表,`setDebugLogging` 切换模板时统一更新(含子 logger) */
const instances = new Set<UbeanLogger>();

function registerInstance(instance: UbeanLogger): UbeanLogger {
  instances.add(instance);
  return instance;
}

/**
 * 运行时切换单个实例的栈捕获。
 *
 * tslog 在构造时一次性计算 `captureStackForMeta`(`_shouldCaptureStack()`),之后仅在每次
 * 日志调用时读取该标志决定是否解析调用位置。因此运行期切换模板时,需要同步刷新这个内部
 * 标志(否则 debug 模板中的 `{{filePathWithLine}}` 渲染为空)。该属性为 tslog 私有字段,
 * 这里通过受控的类型断言访问——本模块是 tslog 的唯一集成点,且 tslog 版本已锁定。
 */
function setStackCapture(instance: UbeanLogger, enabled: boolean): void {
  instance.settings = {
    ...instance.settings,
    stack: { ...instance.settings.stack, capture: enabled ? 'full' : 'auto' }
  };
  (instance as unknown as { captureStackForMeta: boolean }).captureStackForMeta = enabled;
}

/** 按当前 debug 模式刷新单个实例的 pretty 模板与栈捕获 */
function applyDebugMode(instance: UbeanLogger): void {
  instance.settings = {
    ...instance.settings,
    pretty: { ...instance.settings.pretty, template: debugMode ? DEBUG_PRETTY_TEMPLATE : DEFAULT_PRETTY_TEMPLATE }
  };
  setStackCapture(instance, debugMode);
}

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
 * - pretty 输出默认仅消息(精简模板);debug 模式或显式 `pretty.template` 时按需覆盖,
 *   交互式终端彩色、管道/CI 自动去色
 * - 需要结构化 JSON 时显式 `{ type: 'json' }` 或设 `TSLOG_TYPE=json`
 *
 * @example
 * ```ts
 * const log = createUbeanLogger({ name: 'api' });
 * log.info({ port: 3000 }, 'server started');
 * ```
 */
export function createUbeanLogger(options: UbeanLoggerOptions = {}): UbeanLogger {
  const minLevel = options.minLevel ?? configuredMinLevel ?? getLogLevelFromEnv() ?? DEFAULT_MIN_LEVEL;
  const instance = new Logger<ILogObj>({
    name: DEFAULT_NAME,
    ...options,
    pretty: {
      template: debugMode ? DEBUG_PRETTY_TEMPLATE : DEFAULT_PRETTY_TEMPLATE,
      timeZone: 'local',
      ...options.pretty
    },
    minLevel
  });
  return registerInstance(instance);
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
  return registerInstance(logger.getSubLogger({ name: scope, ...options }));
}

/**
 * 切换 debug 日志模式,对所有已创建的 logger 实例(含子 logger)即时生效:
 * - `true`:输出详细日志(日期 + 等级 + 调用位置 + logger 名)
 * - `false`:恢复精简输出(仅消息)
 *
 * 供 CLI 在解析 `--debug` 后调用。
 *
 * @example
 * ```ts
 * setDebugLogging(process.argv.includes('--debug'));
 * ```
 */
export function setDebugLogging(enabled: boolean): void {
  if (debugMode === enabled) return;
  debugMode = enabled;
  for (const instance of instances) applyDebugMode(instance);
}

/**
 * 设置全局日志级别(对已创建与后续创建的所有 logger 实例生效)。
 *
 * 供 CLI 在加载 `logging.level` 配置后调用,覆盖 `LOG_LEVEL`/`TSLOG_LEVEL` 环境
 * 变量的既有效果。传入 `undefined` 为空操作(不覆盖环境变量语义)。
 *
 * 注意:必须走 tslog 实例的 `setMinLevel()` 方法 —— 它会把级别名归一化为数字 id
 * (`tslog` 内部用数值比较过滤);直接改写 `settings.minLevel` 字符串会让比较失真。
 * tslog 的级别名解析大小写不敏感,这里统一大写仅为通过其类型签名。
 *
 * @example
 * ```ts
 * const config = await loadUbeanConfig(cwd);
 * if (config.logging.level) setMinLevel(config.logging.level);
 * ```
 */
export function setMinLevel(level: LogLevelName | TLogLevel | undefined): void {
  if (!level || typeof level !== 'string') return;
  // 统一大写存储:tslog 级别名解析大小写不敏感,但类型签名只收大写
  configuredMinLevel = level.toUpperCase() as TLogLevelName;
  const name = level.toUpperCase() as TLogLevelName;
  for (const instance of instances) {
    instance.setMinLevel(name);
  }
}
