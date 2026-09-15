import { statSync, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { isAbsolute, join, relative } from 'pathe';

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  relativePath: string;
}

export interface DevWatcherOptions {
  cwd: string;
  /**
   * 监听目标，目录或单个文件均可（绝对路径或相对 cwd 的路径）。
   *
   * 目录按递归监听；文件只能非递归监听 —— 入口文件（`app.ts` / `app.vue` /
   * `server.ts` …）就是靠这一条纳入热重载的。
   */
  dirs: string[];
  ignore?: string[];
  onChange?: (events: WatchEvent[]) => void | Promise<void>;
  /**
   * 无法为某个目标建立监听时调用。
   *
   * 调用方应只传入存在的目标（缺失的可选目录请在上游过滤），因此这里不做静默吞掉：
   * 路径拼接错误正是通过「每个目标都失败」暴露的，吞掉 ENOENT 会让整个 dev 热重载
   * 悄无声息地失效。
   */
  onError?: (error: unknown, target: string) => void;
  debounceMs?: number;
}

export interface DevWatcher {
  start(): void;
  stop(): void;
  addDir(dir: string): void;
  /** 已成功建立的监听数（供调用方断言「至少有一个」）。 */
  count(): number;
}

export function createDevWatcher(options: DevWatcherOptions): DevWatcher {
  const { cwd, dirs, ignore = [], debounceMs = 100, onError } = options;
  const watchers: FSWatcher[] = [];
  const watchedDirs = new Set<string>();
  let pendingEvents: WatchEvent[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function isIgnored(relPath: string): boolean {
    return ignore.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
        return regex.test(relPath);
      }
      return relPath.startsWith(pattern) || relPath === pattern;
    });
  }

  function queueEvent(type: WatchEvent['type'], fullPath: string): void {
    const relPath = relative(cwd, fullPath).replace(/\\/g, '/');
    if (isIgnored(relPath)) return;
    if (relPath.startsWith('node_modules/') || relPath.startsWith('.git/')) return;
    if (relPath.endsWith('.bak') || relPath.startsWith('.ubean/')) return;

    pendingEvents.push({ type, path: fullPath, relativePath: relPath });

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const events = pendingEvents;
      pendingEvents = [];
      debounceTimer = null;
      void options.onChange?.(events);
    }, debounceMs);
  }

  /**
   * 监听目标可以是相对 cwd 的路径，也可以是绝对路径。
   *
   * `ResolvedConfig.srcDir` 解析后已是绝对路径，而 `path.join` 遇到绝对路径段不会
   * 重置（只会继续追加），因此这里必须先判断，否则会拼出 `<cwd><cwd>/src/...`。
   */
  function resolveTarget(dir: string): string {
    return isAbsolute(dir) ? dir : join(cwd, dir);
  }

  function watchDir(target: string): void {
    if (watchedDirs.has(target)) return;
    watchedDirs.add(target);

    // 目录递归监听（子目录内容变动也要收到）；文件只能非递归监听。
    let isDirectory = true;
    try {
      isDirectory = statSync(target).isDirectory();
    } catch {
      // 探测失败不在这里处理：交给 fs.watch 抛错，由 onError 统一上报。
    }

    try {
      const w = watch(target, isDirectory ? { recursive: true } : {}, (eventType, filename) => {
        // 文件目标的 `filename` 不可靠（可能是 basename，也可能为空），变更路径就是目标本身；
        // 目录目标才需要拼上相对的文件名。
        const fullPath = isDirectory ? (filename ? join(target, filename) : undefined) : target;
        if (!fullPath) return;
        const type: WatchEvent['type'] = eventType === 'rename' ? 'unlink' : 'change';
        queueEvent(type, fullPath);
      });
      watchers.push(w);
    } catch (error) {
      onError?.(error, target);
    }
  }

  function start(): void {
    for (const dir of dirs) {
      watchDir(resolveTarget(dir));
    }
  }

  function stop(): void {
    for (const w of watchers) {
      w.close();
    }
    watchers.length = 0;
    watchedDirs.clear();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function addDir(dir: string): void {
    watchDir(resolveTarget(dir));
  }

  return { start, stop, addDir, count: () => watchers.length };
}
