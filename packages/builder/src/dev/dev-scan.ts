import type { ViteDevServer } from 'vite';
import type { ResolvedConfig as UbeanResolvedConfig } from '@ubean/config';
import { scanProject } from '@ubean/scan';
/**
 * dev 扫描协调器（RM-V13，ADR-0012 §3）。
 *
 * 整改前三套监听并存，各自扫盘：
 * 1. `ubean:core` 插件经 `server.watcher` 监听 6 个目录 → 扫盘 → 重建路由虚拟模块；
 * 2. `ubean:vue` 插件经 `server.watcher` 监听 3 个目录 + 入口文件 → **又扫一次盘**；
 * 3. CLI 的 `dev-server/watcher.ts` 用 `fs.watch` 自己监一套 → **第三次扫盘**，重建 Hono app。
 *
 * 代价不只是三倍扫盘：三者的**过滤规则与重载时机各不相同**，于是 2 立刻发 `full-reload`、1 故意不发
 * （注释写明「避免与 CLI 的 debounce 重扫抢跑，导致浏览器带着旧的 definePage 元数据刷新」）、
 * 3 在重建完 app 之后才发 —— 也就是「谁先到谁说了算」，那正是「改完要重启 dev server」症状的来源。
 *
 * 本模块把这件事收成一处：
 * - **一套监听**：只用 `server.watcher`（Vite 自己的 watcher）；不再用 `fs.watch`。
 * - **一次扫描**：事件合并去抖 + 单飞（扫描期间的并发事件只排一次后续扫描）。
 * - **一个顺序**：所有订阅者（core 虚拟模块 / vue 虚拟模块 / CLI 的 app 重建）依次完成后再发
 *   `full-reload`。重载因此天然发生在 app 已就绪之后，不再需要「谁不许发」的注释约束。
 *
 * 订阅者通过 `onDevScan(server, fn)` 注册，按注册顺序串行执行（前面的结果可能被后面读到，
 * 例如 CLI 需要 core 先更新路由虚拟模块）。
 *
 * ## 重载判据：结构变了才重载
 *
 * 此前**任何**被监听目录内的变更都会走完「扫描 → 订阅者 → `full-reload`」，包括「只改了页面
 * 组件模板里的一个字」。实测（`apps/docs`，改 `src/pages/index.vue` 的正文文本），Vite HMR 的
 * `update` 与协调器的 `full-reload` 只差 152ms：
 *
 * ```text
 * +7588ms [msg] type=update      {"updates":[{"type":"js-update","path":"/src/pages/index.vue",…}]}
 * +7740ms [msg] type=full-reload {}
 * ```
 *
 * 即：Vue 的 HMR 已经把热替换送进浏览器，协调器随后又整页刷掉 —— 热更新被自己发的重载顶掉。
 * 根因是把「文件变了」当成「结构变了」。
 *
 * 现在判据换成**扫描产物本身**：`ScanResult` 一致（页面正文、组件模板、处理器函数体…都不进
 * 产物）就只跑订阅者、不发 `full-reload`，把这次改动交给 Vite 的 HMR；产物变化（新增/删除
 * 文件、`definePage` 元数据、API 导出、布局、`app.ts` 入口…）才照旧统一重载。
 *
 * 基线由 `prime()` 登记 —— 调用方把「启动时磁盘上的结构」交给协调器（插件在 `buildStart` 的
 * 首次扫描后调用）。没有基线时按「结构变化」处理：宁可多一次重载，也不能让浏览器带着旧路由表
 * 跑。
 */
import type { ScanResult } from '@ubean/scan';

/** `server.watcher` 用到的最小面（测试可传假实现）。 */
export interface DevScanSource {
  add(target: string): void;
  on(event: 'add' | 'unlink' | 'change', handler: (file: string) => void): void;
  off?(event: 'add' | 'unlink' | 'change', handler: (file: string) => void): void;
}

export type DevScanSubscriber = (result: ScanResult, changed: string[]) => void | Promise<void>;

/** 触发扫描的目录名（相对 `srcDir`）。并集来自 core 与 vue 两个插件此前的清单。 */
export const DEV_SCAN_DIRS = ['routes', 'middleware', 'pages', 'layouts', 'plugins', 'app', 'api', 'locales'] as const;

const SCAN_FILE_EXTENSIONS = /\.(ts|js|mjs|cjs|mts|cts|vue|json|md|mdx)$/;

/**
 * `srcDir` **根部**的入口文件名（`app.ts` / `app.vue` / `App.vue` / `server.ts` /
 * `server.dev.ts` …）。它们不在任何被监听的目录里，却同样决定服务端行为
 * （appRoot、defineApp、defineServer），因此必须纳入判据。
 *
 * 用静态规则而不是「等第一次扫描拿到 appEntry 再登记」：后者在入口文件本身是第一个改动对象时
 * 会漏掉 —— 首次扫描永远等不到，入口文件也就永远进不了监听集合（这正是此前「改 app.ts
 * 完全不触发重扫」的缺陷）。
 */
const ENTRY_FILE_PATTERN =
  /^(app|App)(\.(server|client))?\.(ts|js|mjs|mts|vue)$|^server(\.(dev|prod))?\.(ts|js|mjs|mts)$/;

export interface DevScanCoordinatorOptions {
  /** 项目根目录（绝对）。 */
  rootDir: string;
  /** `srcDir`（绝对或相对 rootDir）。 */
  srcDir: string;
  dirs?: UbeanResolvedConfig['dir'];
  ignore?: string[];
  source: DevScanSource;
  /** 扫描实现；默认 `scanProject`（调用方一般不需要覆盖）。 */
  scan?: () => Promise<ScanResult>;
  /**
   * 扫描产物与基线不一致（结构变化）时的重载回调：`full-reload` 由协调器统一发。
   * 产物一致时**不调用**（那次改动交给 Vite 的 HMR）。
   */
  reload?: () => void;
  /** 扫描产物与基线一致（结构没变、不发重载）时的回调，供调用方记日志。 */
  onStructureUnchanged?: (changed: string[]) => void;
  debounceMs?: number;
  /** 扫描失败回调；默认打到 console.error。 */
  onError?: (error: unknown) => void;
}

export interface DevScanCoordinator {
  /** 注册订阅者，返回取消订阅。 */
  subscribe(fn: DevScanSubscriber): () => void;
  /** 建立监听（幂等）。 */
  start(): void;
  /**
   * 登记结构基线：把「当前磁盘上的结构」交给协调器，作为后续「结构是否变化」的比对面。
   * 只记基线，不通知订阅者、不重载（供插件在 `buildStart` 的首次扫描后调用）。
   */
  prime(result: ScanResult): void;
  /** 手动触发一次扫描（DevTools CRUD 后、测试）。 */
  rescan(changed?: string[]): Promise<ScanResult>;
  /** 是否已有订阅者（供调用方判断「框架是否接管了 dev 重载」）。 */
  subscriberCount(): number;
  stop(): void;
}

export function createDevScanCoordinator(options: DevScanCoordinatorOptions): DevScanCoordinator {
  const { rootDir, source, debounceMs = 150 } = options;
  const srcDir = options.srcDir.startsWith('/') ? options.srcDir : `${rootDir}/${options.srcDir}`;
  const srcDirNormalized = srcDir.replace(/\/+$/, '');

  const subscribers = new Set<DevScanSubscriber>();
  const pending = new Set<string>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<ScanResult> | null = null;
  let rerunRequested = false;
  let started = false;
  /** 上一次扫描产物 = 「当前结构」。由 `prime()` 登记，之后每次扫描后更新。 */
  let baseline: ScanResult | undefined;

  const warn = options.onError ?? ((error: unknown) => console.error('[ubean] scan failed:', error));

  /** 扫描目录（绝对）与「额外监听的文件」（入口文件，由扫描结果给出）。 */
  const scanDirPaths = DEV_SCAN_DIRS.map(dir => `${srcDirNormalized}/${dir}`);
  const extraWatchFiles = new Set<string>();

  function isIgnored(file: string): boolean {
    if (file.startsWith('.ubean/') || file.includes('/.ubean/')) return true;
    if (file.includes('/node_modules/') || file.includes('/.git/')) return true;
    if (file.endsWith('.bak')) return true;
    return (options.ignore ?? []).some(pattern => file.includes(pattern.replace(/\*/g, '')));
  }

  /**
   * 事件是否与扫描相关。
   *
   * 判据是**绝对路径**（Vite 的 watcher 给的就是绝对路径）：早先 CLI 那套监听自己把
   * `srcDir` 与事件名拼成路径，`path.join` 遇到绝对路径不重置导致拼出 `<cwd><cwd>/src/...`，
   * 所有监听目标 ENOENT 且异常被吞 —— 表现为「服务端改动完全不生效」。这里不做任何路径拼接。
   */
  function isScanRelevant(file: string): boolean {
    if (!file.endsWith('.vue') && !SCAN_FILE_EXTENSIONS.test(file)) return false;
    if (extraWatchFiles.has(file)) return true;
    if (!file.startsWith(`${srcDirNormalized}/`)) return false;
    const rest = file.slice(srcDirNormalized.length + 1);
    if ((DEV_SCAN_DIRS as readonly string[]).includes(rest.split('/')[0])) return true;
    // srcDir 根部的入口文件（不在任何被监听目录内）
    return !rest.includes('/') && ENTRY_FILE_PATTERN.test(rest);
  }

  function registerExtraFiles(result: ScanResult): void {
    const entries = [
      result.appEntry?.shared,
      result.appEntry?.server,
      result.appEntry?.client,
      result.appEntry?.root,
      result.serverEntry?.shared,
      result.serverEntry?.dev,
      result.serverEntry?.prod
    ];
    for (const entry of entries) {
      if (entry?.exists && entry.fullPath && !extraWatchFiles.has(entry.fullPath)) {
        extraWatchFiles.add(entry.fullPath);
        // 入口文件不在任何被监听的目录里（`src/app.ts`、`src/server.ts`…），必须单独加监听 ——
        // 否则改它们完全不触发重扫（这是实测过的缺陷）。
        source.add(entry.fullPath);
      }
    }
  }

  /**
   * 扫描产物是否与基线不同（= 项目结构变了）。
   *
   * 判据刻意用**整份产物的序列化**，而不是手写「哪些字段算结构」的清单：扫描器是路由表/元数据的
   * 唯一生产者，产物一致即结构一致；清单则会随 `definePage` 之类新增字段而失配 —— 漏一个字段，
   * 浏览器就会带着旧元数据一直跑（且没有任何报错）。扫描产物是纯数据（实测两次扫描序列化结果
   * 逐字节相同），所以直接比对。
   *
   * 无基线时一律返回 `true`：`prime()` 之前的行为与整改前一致（保守多发一次重载）。
   */
  function structureChanged(result: ScanResult): boolean {
    if (baseline === undefined) return true;
    return JSON.stringify(result) !== JSON.stringify(baseline);
  }

  async function runScan(changed: string[]): Promise<ScanResult> {
    const scan =
      options.scan ?? (() => scanProject({ cwd: rootDir, srcDir, dirs: options.dirs, ignore: options.ignore }));
    const result = await scan();
    registerExtraFiles(result);
    // 判定必须在更新基线之前：否则本次扫描会把自己当成基线，永远判「没变」。
    const structural = structureChanged(result);
    baseline = result;
    // 串行 await：订阅者之间可能有先后依赖（CLI 的 app 重建依赖 core 已更新路由虚拟模块）。
    // 订阅者始终执行 —— 它们管的是服务端代码新鲜度（app 重建、虚拟模块失效、类型生成），
    // 与「浏览器要不要整页刷新」是两件事。
    for (const subscriber of subscribers) {
      await subscriber(result, changed);
    }
    // 结构没变（典型：只改了页面组件的模板/脚本）时不发 `full-reload`：Vite 的 HMR 已经把
    // `update` 送进浏览器，再重载等于把刚送到的热替换丢掉。
    if (structural) {
      options.reload?.();
    } else {
      options.onStructureUnchanged?.(changed);
    }
    return result;
  }

  async function rescan(changed: string[] = []): Promise<ScanResult> {
    if (running) {
      // 单飞：扫描期间的并发请求合并为「结束后再扫一次」，而不是排队扫 N 次
      rerunRequested = true;
      return running;
    }
    running = runScan(changed).catch(error => {
      warn(error);
      throw error;
    });
    try {
      return await running;
    } finally {
      running = null;
      if (rerunRequested) {
        rerunRequested = false;
        void rescan([...pending]).catch(() => {});
      }
    }
  }

  function queue(file: string): void {
    pending.add(file);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const changed = [...pending];
      pending.clear();
      void rescan(changed).catch(() => {});
    }, debounceMs);
  }

  const onFileEvent = (file: string): void => {
    if (isIgnored(file) || !isScanRelevant(file)) return;
    queue(file);
  };

  return {
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    start() {
      if (started) return;
      started = true;
      // 目录交给 watcher 递归监听；Vite 已监听项目根，这里是显式声明「这些目录必须有事件」
      // （`srcDir` 可能位于 root 之外，或其中的目录不在模块图里）。
      for (const dir of scanDirPaths) source.add(dir);
      source.on('add', onFileEvent);
      source.on('unlink', onFileEvent);
      source.on('change', onFileEvent);
    },

    prime(result) {
      baseline = result;
    },

    rescan,

    subscriberCount: () => subscribers.size,

    stop() {
      if (!started) return;
      started = false;
      source.off?.('add', onFileEvent);
      source.off?.('unlink', onFileEvent);
      source.off?.('change', onFileEvent);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      pending.clear();
    }
  };
}

/**
 * 每个 Vite dev server 一个协调器，**挂在 server 对象上**。
 *
 * 不能用模块级注册表（WeakMap / 单例）：本仓库的用户 `vite.config.ts` 由 Vite 自己打包加载，
 * 其中的 `ubean/vite` 及其对 `@ubean/build` 的引用会被**内联进配置包**，于是插件实例与 CLI
 * 从 node_modules 直接 import 的那份是**两个模块实例** —— 实测表现为协调器确实建了、事件也到了、
 * 订阅者却是 2（core + vue），CLI 注册的 handler 落在另一个模块的注册表里，永远收不到通知
 * （服务端改动完全不生效，且没有报错）。`server` 实例是两侧唯一共享的东西，因此状态挂它上面，
 * 与 Vite 自身在 server 上挂状态的惯例一致。
 */
interface UbeanScanState {
  coordinator?: DevScanCoordinator;
  /** 协调器建立之前的订阅（CLI 在服务器启动阶段就可能注册）。 */
  pending?: Set<DevScanSubscriber>;
}

const SCAN_STATE_KEY = '__ubeanScanState';

function scanStateOf(server: ViteDevServer): UbeanScanState {
  const holder = server as unknown as Record<string, unknown>;
  holder[SCAN_STATE_KEY] ??= {} as UbeanScanState;
  return holder[SCAN_STATE_KEY] as UbeanScanState;
}

/**
 * 取（或建立）该 dev server 的协调器。
 *
 * core 与 vue 插件都调用它，因此**先到的那个**负责建实例；后到的拿同一个。
 * `init` 只在首次调用时执行。
 */
export function getDevScanCoordinator(
  server: ViteDevServer,
  init: (source: DevScanSource) => DevScanCoordinatorOptions
): DevScanCoordinator {
  const state = scanStateOf(server);
  if (state.coordinator) return state.coordinator;

  const coordinator = createDevScanCoordinator(init(server.watcher as unknown as DevScanSource));
  state.coordinator = coordinator;
  if (state.pending) {
    for (const fn of state.pending) coordinator.subscribe(fn);
    state.pending = undefined;
  }
  coordinator.start();
  return coordinator;
}

/**
 * 取该 dev server **已存在**的协调器（不存在返回 undefined）。
 *
 * 给「只想触发一次扫描」的调用方用（CLI 的 `rescan()`）：`getDevScanCoordinator` 需要 init
 * 参数、会在缺失时建实例，不适合这里。
 */
export function peekDevScanCoordinator(server: ViteDevServer): DevScanCoordinator | undefined {
  return scanStateOf(server).coordinator;
}

/**
 * 订阅 dev 扫描（CLI 用：每次扫描后重建 Hono app 并让浏览器重载）。
 *
 * 允许在协调器建立之前订阅：`getDevScanCoordinator` 会把已登记的订阅转交给新实例。
 */
export function onDevScan(server: ViteDevServer, handler: DevScanSubscriber): () => void {
  const state = scanStateOf(server);
  if (state.coordinator) return state.coordinator.subscribe(handler);

  state.pending ??= new Set<DevScanSubscriber>();
  state.pending.add(handler);
  return () => state.pending?.delete(handler);
}
