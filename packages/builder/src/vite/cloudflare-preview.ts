/**
 * Cloudflare 产物的本地预览 runner（RM-V26）。
 *
 * 目的：`wrangler dev` 不可用时也能预览 worker 产物 —— 直接把构建出来的 `dist/server/worker.mjs`
 * 交给 **miniflare** 在进程内跑，而不是让用户去装 wrangler 或上传到 Cloudflare 才知道产物对不对。
 *
 * `miniflare` 是**可选 peer**（同 `satori`/`@resvg/resvg-js` 的约定）：本模块动态 import 它，缺失时
 * 返回 `{ ok: false, reason: 'miniflare-not-installed' }` 而不是抛错 —— 调用方据此给出可执行的提示，
 * 其余 preview 形态（node / static）完全不受影响。
 *
 * 实测过的 miniflare 面（4.20250214.0-rc.0）：
 * - 构造：`new Miniflare({ modules: [{ type: 'ESModule', path }], compatibilityDate })`
 * - 就绪：`await mf.ready`
 * - 派发：`mf.dispatchFetch(url, { method, headers, body })` —— **注意**这个版本的
 *   `dispatchFetch` 不接受 `Request` 实例（实测 `Failed to parse URL from [object Request]`），
 *   因此这里拆成 url + init，非 GET/HEAD 时用 `arrayBuffer()` 带体（POST 体实测可达 worker）。
 * - 释放：`mf.dispose()`
 *
 * 静态资源**不经 miniflare 的 `assets` 选项**：该选项在本版本上 `mf.ready` 直接失败
 * （`The Workers runtime failed to start`）。改为与 Cloudflare 平台同构的做法 —— 静态层在当前
 * 进程先服务 `dist/public`（预渲染 HTML / 资源），未命中再交给 worker。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/** miniflare 实例的最小面（只声明用到的部分，避免把可选依赖的类型带进公共类型）。 */
export interface MiniflareInstanceLike {
  ready: Promise<unknown>;
  dispatchFetch(
    input: string,
    init?: { method?: string; headers?: Headers | Record<string, string>; body?: BodyInit }
  ): Promise<Response>;
  dispose(): Promise<void>;
}

export type MiniflareConstructorLike = new (options: Record<string, unknown>) => MiniflareInstanceLike;

export interface CloudflarePreviewOptions {
  /** 产物里的 worker 入口（`<outputDir>/server/worker.mjs`）。 */
  workerPath: string;
  /** 兼容性日期（来自 preset；缺省用 wrangler.toml 同款默认值）。 */
  compatibilityDate?: string;
  /** 兼容性标志（来自 wrangler.toml；缺省为 `['nodejs_compat']`，与生成的配置一致）。 */
  compatibilityFlags?: string[];
  /** 测试注入点：默认动态 import `miniflare`。 */
  loadMiniflare?: () => Promise<MiniflareConstructorLike | null>;
}

export interface CloudflarePreviewRunner {
  /** 把 Web `Request` 派发进 worker（静态层由调用方先行处理）。 */
  fetch: (request: Request) => Promise<Response>;
  dispose: () => Promise<void>;
}

export type CloudflarePreviewResult =
  | { ok: true; runner: CloudflarePreviewRunner }
  | {
      ok: false;
      reason: 'miniflare-not-installed' | 'worker-missing' | 'worker-failed-to-start';
      message: string;
    };

const DEFAULT_COMPATIBILITY_DATE = '2024-09-01';

export const MINIFLARE_INSTALL_HINT =
  'Install it with `pnpm add -D miniflare`, or preview with `wrangler dev` instead.';

/**
 * 默认加载器：动态 import `miniflare`。
 *
 * 规格字符串放进变量是**故意的** —— 让打包器无法静态解析这个可选依赖（否则构建会尝试解析一个
 * 未安装的包）。
 */
export async function defaultLoadMiniflare(): Promise<MiniflareConstructorLike | null> {
  const specifier = 'miniflare';
  try {
    const mod = (await import(/* @vite-ignore */ specifier)) as { Miniflare?: MiniflareConstructorLike };
    return mod.Miniflare ?? null;
  } catch {
    return null;
  }
}

/**
 * 创建 Cloudflare 预览 runner。
 *
 * 失败不抛错：返回带 `reason` 的结果，让调用方决定是降级提示还是继续（与可选依赖的整体策略一致）。
 */
export async function createCloudflarePreviewRunner(
  options: CloudflarePreviewOptions
): Promise<CloudflarePreviewResult> {
  const { workerPath, compatibilityDate, compatibilityFlags, loadMiniflare = defaultLoadMiniflare } = options;

  // 兼容性日期与标志**默认从产物旁的 wrangler.toml 读**：它们必须与部署用的一致，否则会出现
  // 「预览能跑、部署起不来」或反之（实测：日期早于 2024-09-23 时 `nodejs_compat` 按 v1 生效，
  // 没有 `process` / `Buffer` 这类全局，SSR 直接 500）。
  const wranglerToml = resolve(dirname(workerPath), '..', 'wrangler.toml');
  const resolvedDate = compatibilityDate ?? readCompatibilityDate(wranglerToml) ?? DEFAULT_COMPATIBILITY_DATE;
  const resolvedFlags = compatibilityFlags ?? readCompatibilityFlags(wranglerToml) ?? ['nodejs_compat'];

  if (!existsSync(workerPath)) {
    return {
      ok: false,
      reason: 'worker-missing',
      message: `Build output not found: ${workerPath}. Run \`ubean build\` first to create a production build.`
    };
  }

  const Miniflare = await loadMiniflare();
  if (!Miniflare) {
    return {
      ok: false,
      reason: 'miniflare-not-installed',
      message: `The cloudflare preset needs \`miniflare\` to preview locally. ${MINIFLARE_INSTALL_HINT}`
    };
  }

  const instance = new Miniflare({
    // 模块表是**权威清单**（同 wrangler 打包后的形态）：产物里 `worker.mjs` 会
    // `import './entry.mjs'`，只登记 worker 会直接报 `No such module "entry.mjs"`（实测）。
    //
    // 路径语义踩过两次坑，结论来自 miniflare 源码：`readFileSync(def.path)` **按 process.cwd()
    // 读**，而 workerd 侧的模块名是 `relative(modulesRoot, path)`。因此必须让两者同时成立 ——
    // `path` 用 cwd 相对路径，`modulesRoot` 取 cwd 与产物目录的**公共祖先**（否则 workerd 会因为
    // 模块名里的 `..` 报 `can't use ".." to break out of starting directory`）。
    modulesRoot: commonAncestor(process.cwd(), dirname(workerPath)),
    modules: workerModuleEntries(workerPath),
    compatibilityDate: resolvedDate,
    compatibilityFlags: resolvedFlags
  });

  try {
    await instance.ready;
  } catch (err) {
    // 产物起不来是最有价值的一类失败信息：workerd 的报错（例如 `No such module "node:fs/promises"`）
    // 直接指出产物里含 Node 专有导入，而这类问题在文件清单/体积门禁里都看不见。
    await instance.dispose().catch(() => undefined);
    return {
      ok: false,
      reason: 'worker-failed-to-start',
      message: `The Cloudflare worker bundle failed to start in workerd: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  return {
    ok: true,
    runner: {
      async fetch(request: Request): Promise<Response> {
        const method = request.method || 'GET';
        const hasBody = method !== 'GET' && method !== 'HEAD';
        return instance.dispatchFetch(request.url, {
          method,
          headers: request.headers,
          body: hasBody ? await request.arrayBuffer() : undefined
        });
      },
      dispose: () => instance.dispose()
    }
  };
}

/**
 * worker 目录下所有需要登记的模块。
 *
 * miniflare（同 wrangler）把 `modules` 当**权威模块表**：产物里 `worker.mjs` 会
 * `import './entry.mjs'`，若只登记 worker，运行时直接报 `No such module "entry.mjs"`（实测）。
 * 因此遍历同目录的 `.mjs`（含 chunk 划分的产物），路径用 **cwd 相对**形态（见调用处的路径语义说明）。
 */
function workerModuleEntries(workerPath: string): Array<{ type: 'ESModule'; path: string }> {
  const dir = dirname(workerPath);
  const toEntry = (file: string): { type: 'ESModule'; path: string } => ({
    type: 'ESModule',
    path: relative(process.cwd(), file)
  });
  const entries = [toEntry(workerPath)];
  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.mjs')) continue;
      const full = join(dir, file);
      if (full !== workerPath) entries.push(toEntry(full));
    }
  } catch {
    /* 目录不可读时只登记 worker 本身，让运行时给出更具体的错误 */
  }
  return entries;
}

/** 两个路径的公共祖先（用于 workerd 的模块名基准）。 */
function commonAncestor(a: string, b: string): string {
  const partsA = resolve(a).split(sep);
  const partsB = resolve(b).split(sep);
  const common: string[] = [];
  for (let i = 0; i < Math.min(partsA.length, partsB.length); i += 1) {
    if (partsA[i] !== partsB[i]) break;
    common.push(partsA[i]);
  }
  return common.join(sep) || sep;
}

/** 从 wrangler.toml 里取 `compatibility_flags`（预览必须与部署用同一组标志）。 */
export function readCompatibilityFlags(wranglerToml: string): string[] | undefined {
  if (!existsSync(wranglerToml)) return undefined;
  try {
    const match = /compatibility_flags\s*=\s*\[([^\]]*)\]/.exec(readFileSync(wranglerToml, 'utf-8'));
    if (!match) return undefined;
    const flags = match[1]
      .split(',')
      .map(part => part.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    return flags.length > 0 ? flags : undefined;
  } catch {
    return undefined;
  }
}

/** 从 wrangler.toml 里取兼容性日期（preset 生成的文件就是它的产物契约）。 */
export function readCompatibilityDate(wranglerToml: string): string | undefined {
  if (!existsSync(wranglerToml)) return undefined;
  try {
    // 只在预览启动时读一次，用同步读避免把启动路径拆成两段异步
    const match = /compatibility_date\s*=\s*"([^"]+)"/.exec(readFileSync(wranglerToml, 'utf-8'));
    return match?.[1];
  } catch {
    return undefined;
  }
}

/**
 * workerd（Cloudflare Workers 运行时）不支持的 Node 内建 —— 即使开了 `nodejs_compat` 也不行。
 * 列在这里是为了让构建期的告警能直接点名，而不是等 worker 起不来时再去猜。
 */
const UNSUPPORTED_IN_WORKERD = [
  'node:fs',
  'node:fs/promises',
  'node:net',
  'node:os',
  'node:child_process',
  'node:worker_threads'
];

/**
 * 审计 worker 产物里的 Node 内建导入（返回命中的模块名，全部不重复）。
 *
 * 起因是一次实测：cloudflare preset 构建出的 `server/worker.mjs` 在图里带进了 `node:fs/promises`
 * （来自 `@ubean/app` / `@ubean/server/static` 的静态服务路径），miniflare 启动时直接报
 * `No such module "node:fs/promises"` —— **产物在 worker 运行时里根本起不来**。文件清单比对与体积
 * 门禁都看不见这类问题（不看产物内容，更不会去跑它）。
 *
 * 这里只报告、不阻断：把失败从「运行时谜团」变成「构建期清单」，同时保持既有构建行为不变。
 * 真正的修法是让 Node 专有路径在 worker 构建里消失（条件注册 / 动态 import），属于独立一笔。
 */
export function findUnsupportedNodeImports(serverDir: string): string[] {
  const found = new Set<string>();

  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (isDirectory(full)) {
        walk(full);
        continue;
      }
      if (!/\.(mjs|js)$/.test(entry)) continue;
      let code: string;
      try {
        code = readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      for (const specifier of UNSUPPORTED_IN_WORKERD) {
        // 三种形态：静态 import / re-export from / 动态 import('…')
        if (new RegExp(`(from\\s*|import\\s*\\(\\s*)["']${specifier}["']`).test(code)) found.add(specifier);
      }
    }
  };

  walk(serverDir);
  return [...found].sort();
}

/** 目录判断（不可读时按非目录处理）。 */
function isDirectory(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}
