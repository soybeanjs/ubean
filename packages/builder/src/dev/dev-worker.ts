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
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizePath } from 'vite';

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
let moduleRunner;
let entryPromise;

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
      // 作用域化失效：宿主已经失效了对应模块（连同其 importer 链），这里**只负责重新拿入口**。
      // 具体的重新求值由 ModuleRunner 自己完成 —— \`fetchModule\` 会因宿主侧 transformResult 被清空
      // 而返回 \`invalidate: true\`，runner 据此失效该节点，于是它连同受影响的 importer 一起重跑，
      // 而未命中的模块仍命中 \`{ cache: true }\`，实例（单例）原样保留。
      // 千万不要在这里按 url 自行失效：宿主若没失效同名模块，下一次 fetch 会因 \`cache: true\` +
      // 本地 meta 已被清空而抛 “mistakenly invalidated during fetch phase”。
      if (message?.type === 'ubean:invalidate') {
        if (Array.isArray(message.urls) && message.urls.length > 0) entryPromise = undefined;
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
 * **宿主侧失效是充分且必须的一步**：`invalidateModule` 会清掉 `transformResult` 并沿 importer
 * 链传播，于是 worker 下次取模块时拿到的是新代码（且 `fetchModule` 带回 `invalidate: true`），
 * 未被命中的模块仍返回 `{ cache: true }`，实例（单例）保留 —— 这正是 R3 要求的语义。
 *
 * 难点在于**文件键**：Vite 的模块图按 `cleanUrl(resolvedId)` 建索引，而 resolvedId 是解析
 * 符号链接后的真实路径。macOS 上 `os.tmpdir()` 返回 `/var/folders/...`，而 realpath 是
 * `/private/var/folders/...`，watcher 给出的原始路径直接查表必然落空（RM-V09 实测）。
 * 因此这里对每个文件同时尝试原始路径与 realpath 两种候选键。
 *
 * 返回值用于诊断：`urls` 为空即表示这次失效**什么都没命中**（多半是路径键不一致或模块尚未
 * 被加载），调用方据此可以给出比「静默无操作」更有用的信息。
 */
export interface DevWorkerInvalidation {
  /** 实际命中模块图的键（去重）。 */
  keys: string[];
  /** 被失效的模块 URL（宿主侧唯一的稳定标识）。 */
  urls: string[];
}

export function invalidateDevWorkerModules(
  environment: {
    moduleGraph: {
      getModulesByFile(file: string): Iterable<{ url?: string | null }> | undefined;
      invalidateModule(mod: never): void;
    };
  },
  runner: { sendMessage(message: unknown): void },
  files: readonly string[]
): DevWorkerInvalidation {
  const keys: string[] = [];
  const urls = new Set<string>();

  for (const file of files) {
    for (const key of candidateFileKeys(file)) {
      const mods = environment.moduleGraph.getModulesByFile(key);
      if (!mods) continue;
      let hit = false;
      for (const mod of mods) {
        hit = true;
        if (mod.url) urls.add(mod.url);
        environment.moduleGraph.invalidateModule(mod as never);
      }
      if (hit) keys.push(key);
    }
  }

  // 什么都没命中就不通知 worker：空消息只会白白重置入口缓存
  if (urls.size > 0) runner.sendMessage({ type: 'ubean:invalidate', urls: [...urls] });

  return { keys, urls: [...urls] };
}

/** 模块图可能用原始路径或 realpath 建索引，两种都试（去重、保序）。 */
function candidateFileKeys(file: string): string[] {
  const keys = [normalizePath(file)];
  try {
    keys.push(normalizePath(realpathSync.native(file)));
  } catch {
    // 文件可能刚被删除 —— 原始路径仍然是有效候选
  }
  return [...new Set(keys)];
}
