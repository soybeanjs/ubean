/**
 * dev worker 入口（RM-V09，ADR-0012 §3）。
 *
 * dev 下服务端代码在 env-runner 的 worker 里跑：worker 内用 Vite 的 `ModuleRunner` 经 IPC
 * 向宿主取转换后的模块（对齐 `nitro:src/runtime/internal/vite/dev-worker.mjs`）。
 *
 * 这个入口由**框架生成到项目 `.ubean/` 下**，而不是随包发布：
 * - 避免打包器把 `.mjs` 资源漏掉（`vp pack` 只产出 JS 入口）；
 * - 生成的入口与当前运行的框架版本天然一致，不会出现 worker 用旧版本的情况。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 生成到 `.ubean/` 下的文件名。 */
export const DEV_WORKER_FILE = 'dev-worker.mjs';

export interface DevWorkerEntryOptions {
  /** 与宿主 `UbeanDevEnvironment` 的环境名一致（env-runner 按它做命名空间过滤）。 */
  envName: string;
  /** worker 要加载的服务端入口模块 id（dev 下由宿主转换）。 */
  entryId: string;
  /**
   * `env-runner/vite` 的定位符。默认是裸 specifier —— 只有当入口所在项目能解析到 env-runner
   * 时才可用；入口被生成到项目 `.ubean/` 下时，由调用方（cli，它才有 env-runner 依赖）传入
   * 解析后的绝对 `file://` URL，避免「worker 里 import 不到包」。
   */
  envRunnerVite?: string;
  /** `vite/module-runner` 的定位符，同上。 */
  moduleRunner?: string;
}

/**
 * worker 入口源码。刻意保持纯 ESM、无类型语法 —— worker 直接由 Node 加载，不经过转换。
 */
export function getDevWorkerEntrySource(options: DevWorkerEntryOptions): string {
  const envName = JSON.stringify(options.envName);
  const entryId = JSON.stringify(options.entryId);
  const envRunnerVite = JSON.stringify(options.envRunnerVite ?? 'env-runner/vite');
  const moduleRunner = JSON.stringify(options.moduleRunner ?? 'vite/module-runner');

  return `// 由 @ubean/build 生成，勿手工编辑（RM-V09）。
import { createViteTransport } from ${envRunnerVite};
import { ModuleRunner, ESModulesEvaluator } from ${moduleRunner};

const ENV_NAME = ${envName};
const ENTRY_ID = ${entryId};

const listeners = [];
const failed = [];
let moduleRunner;
let entryPromise;

/** 作用域化失效：只让命中文件的模块重新求值，其余实例（单例）保留。 */
function invalidateFiles(files) {
  const invalidated = [];
  for (const file of files) {
    try {
      for (const module of moduleRunner?.getModulesByFile(file) ?? []) {
        if (module.url) {
          moduleRunner.invalidateModule(module.url);
          invalidated.push(module.url);
        }
      }
    } catch (error) {
      failed.push(\`invalidate \${file}: \${error?.message || error}\`);
    }
  }
  // 入口可能因失效而需要重新求值（其内部未被失效的依赖仍复用既有实例）
  if (invalidated.length > 0) entryPromise = undefined;
  return invalidated;
}

async function getEntry() {
  entryPromise ??= moduleRunner.import(ENTRY_ID).then(mod => mod.default ?? mod);
  return entryPromise;
}

export default {
  async fetch(request) {
    if (!moduleRunner) return new Response('ubean dev worker: module runner not ready', { status: 503 });
    try {
      const entry = await getEntry();
      if (typeof entry?.fetch === 'function') return entry.fetch(request);
      return new Response('ubean dev worker: entry has no fetch handler', { status: 500 });
    } catch (error) {
      // 把错误带回宿主：worker 直接抛会让连接重置，宿主只看到 ECONNRESET，无从诊断
      return new Response(\`ubean dev worker error: \${error?.stack || error}\`, { status: 599 });
    }
  },
  ipc: {
    onOpen({ sendMessage }) {
      moduleRunner = new ModuleRunner(
        {
          transport: createViteTransport(sendMessage, listener => listeners.push(listener), ENV_NAME)
        },
        new ESModulesEvaluator()
      );
    },
    onMessage(message) {
      if (message?.type === 'ubean:invalidate' && Array.isArray(message.files)) {
        invalidateFiles(message.files);
        return;
      }
      // 其余消息按 env-runner 约定转给 transport 监听器
      for (const listener of listeners) listener(message);
    }
  }
};
`;
}

/** 把 worker 入口写到 `<dir>/dev-worker.mjs`，返回其绝对路径（供 env-runner 的 `data.entry`）。 */
export async function writeDevWorkerEntry(dir: string, options: DevWorkerEntryOptions): Promise<string> {
  await mkdir(dir, { recursive: true });
  const target = join(dir, DEV_WORKER_FILE);
  await writeFile(target, getDevWorkerEntrySource(options), 'utf8');
  return target;
}

/**
 * 失效指定文件对应的模块（RM-V13 的 watcher 会用它）。
 *
 * **两侧都要失效**，缺一不可：
 * - 宿主侧的模块图 —— 否则 worker 重新请求时命中宿主的转换缓存，拿到的还是旧代码；
 * - worker 内的 `ModuleRunner` —— 否则已加载的模块不会重新求值。
 *
 * 其余未被命中的模块实例（单例）在两侧都保留，这正是 R3 要求的语义。
 */
export function invalidateDevWorkerModules(
  environment: {
    moduleGraph: {
      getModulesByFile(file: string): Iterable<{ id?: string | null }> | undefined;
      invalidateModule(mod: never): void;
    };
  },
  runner: { sendMessage(message: unknown): void },
  files: readonly string[]
): void {
  if (files.length === 0) return;

  for (const file of files) {
    for (const mod of environment.moduleGraph.getModulesByFile(file) ?? []) {
      environment.moduleGraph.invalidateModule(mod as never);
    }
  }

  runner.sendMessage({ type: 'ubean:invalidate', files: [...files] });
}
