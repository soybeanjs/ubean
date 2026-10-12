import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join } from 'pathe';
import { buildInstallCommand, detectPackageManager, formatCommand } from './package-manager';
import type { PackageManager } from './package-manager';
import {
  detectOgImageConvention,
  findMissingProjectDependencies,
  resolveConfigDependencies,
  resolveProjectUbeanVersion
} from './project-deps';
import type { ProjectDependencySpec } from './project-deps';

/**
 * `ensurePackages` 式的项目依赖提醒（对齐 soybeanjs/eslint-config 的同名函数）。
 *
 * 与 `eslint-config` 的差异是**清单来源**：那边是一组固定包名，这边由用户配置算出 ——
 * `ui: true` 才要求 `@vean/ui`，`electron: true` 才要求 `electron`，`search` 开了才要求
 * `pagefind`。清单与「必需 / 可选」的判定都在 `./project-deps.ts`。
 *
 * 交互（三条判据，缺一即退化为只打印）：
 * 1. `process.env.CI` 为空（CI 里没人回答提问）
 * 2. `process.stdin.isTTY`（管道 / 重定向下不能阻塞等输入）
 * 3. 调用方显式传 `mode: 'prompt'`（Vite 插件路径默认同此）
 *
 * 同一个进程只问一次（`build` 的 `config` 钩子会因多个环境跑多次）。
 */

const CHECKED_KEY = '__ubean_project_deps_checked__';

export interface DependencyCheckLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface InstallPlan {
  /** 装进 dependencies 的包（`name@range`）。 */
  prod: string[];
  /** 装进 devDependencies 的包。 */
  dev: string[];
  packageManager: PackageManager;
  /** 可直接复制粘贴的命令行（prod 在前）。 */
  commands: string[];
  /** 安装计划涉及的包名（不含版本后缀），用于测试与日志。 */
  names: string[];
}

export interface ProjectDependencyCheckResult {
  missing: ProjectDependencySpec[];
  required: ProjectDependencySpec[];
  optional: ProjectDependencySpec[];
  /** 缺失项为空时 undefined。 */
  plan?: InstallPlan;
  /** 实际是否执行了安装。 */
  installed: boolean;
  /** 是否向用户提问了（false 表示只打印了提示）。 */
  prompted: boolean;
  /** 已安装（无需提示）的包名。 */
  satisfied: string[];
}

export interface ProjectDependencyCheckOptions {
  cwd: string;
  /** 已解析配置（`ResolvedConfig` 或原始用户配置均可）。 */
  config: Record<string, unknown>;
  /** `'prompt'` 在可交互终端下询问并安装；`'warn'` 永远只打印。默认 `'warn'`。 */
  mode?: 'prompt' | 'warn';
  /** 是否把核心依赖（vue / vue-router / vue-i18n）纳入检查。默认 true。 */
  core?: boolean;
  /** 项目源码目录（用于探测 OG 图约定文件）。默认 `src`。 */
  srcDir?: string;
  /** 覆盖 OG 图约定探测（测试用）。 */
  ogImage?: boolean;
  logger?: DependencyCheckLogger;
  /** 覆盖包管理器探测（测试用）。 */
  packageManager?: PackageManager;
  /** 覆盖可交互判定（测试用）。 */
  interactive?: boolean;
  /** 覆盖安装执行器（测试用）。 */
  install?: (plan: InstallPlan) => Promise<void> | void;
  /** 覆盖提问实现（测试用）。默认 `node:readline/promises`。 */
  confirm?: (question: string) => Promise<boolean>;
  /** 同一进程内跳过重复检查（默认 true）。 */
  once?: boolean;
}

function defaultLogger(): DependencyCheckLogger {
  return {
    info: message => console.log(`[ubean] ${message}`),
    warn: message => console.warn(`[ubean] ${message}`)
  };
}

/**
 * 渲染安装用的 `name@spec`：
 * 1. 清单自带的 `range` 优先
 * 2. `versionFromUbean` 的 `@ubean/*` 包钉到项目的 ubean 版本
 * 3. 其余不钉版本
 *
 * 只有「纯 semver 字符」的 range 才会拼进命令（`^1.7.7`）。带比较符或 `||` 的 range
 * （`>=0.50.0-0`、`^28 || ^29 || …`）**一律丢掉**：`>` 是 shell 重定向、`|` 是管道，
 * 拼出来的命令根本跑不通（会把输出重定向到文件、或把后面的包名当别的命令）。
 * 用户装到符合 peer 范围的版本由包管理器自己挑最新满足版，比给错命令好。
 */
function withRange(spec: ProjectDependencySpec, ubeanVersion: string | null): string {
  if (spec.range && SAFE_RANGE.test(spec.range)) return `${spec.name}@${spec.range}`;
  if (spec.versionFromUbean && ubeanVersion) return `${spec.name}@^${ubeanVersion}`;
  return spec.name;
}

/** 把缺失项按安装位置分组，构造可直接执行的安装计划。 */
export function buildInstallPlan(
  missing: ProjectDependencySpec[],
  packageManager: PackageManager,
  ubeanVersion: string | null = null
): InstallPlan {
  const prod = missing.filter(s => s.installAs === 'prod').map(s => withRange(s, ubeanVersion));
  const dev = missing.filter(s => s.installAs === 'dev').map(s => withRange(s, ubeanVersion));
  const commands: string[] = [];
  if (prod.length > 0) commands.push(formatCommand(buildInstallCommand(packageManager, prod)));
  if (dev.length > 0) commands.push(formatCommand(buildInstallCommand(packageManager, dev, { dev: true })));
  return { prod, dev, packageManager, commands, names: missing.map(s => s.name) };
}

/**
 * 逐条打印缺失依赖：包名 + 必需程度 + 谁要求它 + 为什么需要。
 *
 * 输出必须**自解释**：用户看到的是「为什么框架让我装这个」，不是一串包名。
 */
export function formatMissingDependencyReport(
  missing: ProjectDependencySpec[],
  plan: InstallPlan,
  logger: DependencyCheckLogger
): void {
  const required = missing.filter(s => s.kind === 'required');
  const optional = missing.filter(s => s.kind === 'optional');

  if (required.length > 0) {
    logger.warn(
      `Missing required project dependencies for enabled features (${required.length}) — ` +
        `the feature is broken until installed:`
    );
    for (const spec of required) {
      logger.warn(`  - ${spec.name}  (required by \`${spec.requiredBy}\`) — ${spec.reason}`);
    }
  }
  if (optional.length > 0) {
    logger.warn(`Missing optional project dependencies (${optional.length}) — the feature degrades without them:`);
    for (const spec of optional) {
      logger.warn(`  - ${spec.name}  (optional, \`${spec.requiredBy}\`) — ${spec.reason}`);
    }
  }

  for (const command of plan.commands) {
    logger.warn(`  install with: ${command}`);
  }
}

/** 逐条打印已满足的依赖（`--verbose` 场景；默认静默）。 */
export function formatSatisfiedReport(satisfied: string[], logger: DependencyCheckLogger): void {
  if (satisfied.length === 0) return;
  logger.info(`Project dependencies OK (${satisfied.length}): ${satisfied.join(', ')}`);
}

function isInteractive(options: ProjectDependencyCheckOptions): boolean {
  if (options.interactive !== undefined) return options.interactive;
  if (process.env.CI) return false;
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

async function defaultConfirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} (y/N) `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/** 允许拼进安装命令的 range 字符集（semver 运算符，无 shell 元字符）。 */
const SAFE_RANGE = /^[\w.+~^=-]+$/;

/**
 * 用项目自己的包管理器执行安装（`stdio: inherit`，让进度条与错误直接可见）。
 *
 * 走 `execFileSync` 而不是 `execSync`：不经过 shell，包名 / range 里的字符无法被解释成
 * 重定向或管道。命令展示（`formatCommand`）另做引号处理。
 */
export function runInstallPlan(plan: InstallPlan, cwd: string): void {
  const run = (packages: string[], dev: boolean): void => {
    if (packages.length === 0) return;
    const command = buildInstallCommand(plan.packageManager, packages, { dev });
    execFileSync(command.cmd, command.args, { cwd, stdio: 'inherit', env: { ...process.env } });
  };
  run(plan.prod, false);
  run(plan.dev, true);
}

/**
 * 检查项目依赖，缺失时提示（可交互时询问并安装）。
 *
 * **永不抛错**：依赖提醒是 DX 产物，装不上也只降级为 warning —— 不能因为一次
 * `pnpm add` 失败就让 `vite dev` 起不来。
 */
export async function checkProjectDependencies(
  options: ProjectDependencyCheckOptions
): Promise<ProjectDependencyCheckResult> {
  const logger = options.logger ?? defaultLogger();
  // OG 图依赖只在用户真的写了 `src/og-image.ts` 这类约定文件时才要求 —— 它没有配置开关。
  const ogImage = options.ogImage ?? detectOgImageConvention(options.cwd, options.srcDir ?? 'src');
  const resolved = resolveConfigDependencies(options.config, { core: options.core, ogImage });
  const missing = findMissingProjectDependencies(options.cwd, resolved);
  const satisfied = resolved.all.filter(s => !missing.includes(s)).map(s => s.name);

  const empty: ProjectDependencyCheckResult = {
    missing: [],
    required: [],
    optional: [],
    installed: false,
    prompted: false,
    satisfied
  };
  if (missing.length === 0) return empty;

  const required = missing.filter(s => s.kind === 'required');
  const optional = missing.filter(s => s.kind === 'optional');
  const packageManager = options.packageManager ?? detectPackageManager(options.cwd);
  const plan = buildInstallPlan(missing, packageManager, resolveProjectUbeanVersion(options.cwd));

  const wantPrompt = options.mode === 'prompt' && isInteractive(options);
  formatMissingDependencyReport(missing, plan, logger);

  if (!wantPrompt || !existsSync(join(options.cwd, 'package.json'))) {
    return { missing, required, optional, plan, installed: false, prompted: false, satisfied };
  }

  const confirm = options.confirm ?? defaultConfirm;
  const question =
    required.length > 0
      ? `Install ${missing.length} missing project dependenc${missing.length === 1 ? 'y' : 'ies'} now?`
      : `Install ${missing.length} optional project dependenc${missing.length === 1 ? 'y' : 'ies'} now?`;

  let agreed = false;
  try {
    agreed = await confirm(question);
  } catch {
    // stdin 被占用 / 提问失败：退化为只提示，不阻塞
    return { missing, required, optional, plan, installed: false, prompted: false, satisfied };
  }
  if (!agreed) return { missing, required, optional, plan, installed: false, prompted: true, satisfied };

  try {
    const install = options.install ?? ((p: InstallPlan) => runInstallPlan(p, options.cwd));
    await install(plan);
    logger.info(`Installed: ${[...plan.prod, ...plan.dev].join(', ')}`);
    return { missing, required, optional, plan, installed: true, prompted: true, satisfied };
  } catch (error) {
    logger.warn(`Failed to install project dependencies: ${error instanceof Error ? error.message : String(error)}`);
    for (const command of plan.commands) logger.warn(`Please install manually: ${command}`);
    return { missing, required, optional, plan, installed: false, prompted: true, satisfied };
  }
}

/**
 * 进程内只检查一次（`build` 的 `config` 钩子会因多个环境跑多次）。
 *
 * 返回值与 `checkProjectDependencies` 相同；重复调用返回首次结果的浅拷贝（`skipped: true`）。
 */
export async function checkProjectDependenciesOnce(
  options: ProjectDependencyCheckOptions
): Promise<ProjectDependencyCheckResult & { skipped?: boolean }> {
  if (options.once === false) return checkProjectDependencies(options);
  const g = globalThis as typeof globalThis & { [CHECKED_KEY]?: Promise<ProjectDependencyCheckResult> };
  if (!g[CHECKED_KEY]) {
    g[CHECKED_KEY] = checkProjectDependencies(options).catch(() => ({
      missing: [],
      required: [],
      optional: [],
      installed: false,
      prompted: false,
      satisfied: []
    }));
  }
  return g[CHECKED_KEY];
}

/** 清空「只检查一次」的进程内缓存（测试用）。 */
export function resetProjectDependencyCheckCache(): void {
  delete (globalThis as typeof globalThis & { [CHECKED_KEY]?: unknown })[CHECKED_KEY];
}
