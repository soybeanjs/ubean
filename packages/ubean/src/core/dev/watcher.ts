import { watch } from 'node:fs';
import { join, relative } from 'pathe';
import type { FSWatcher } from 'node:fs';

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  relativePath: string;
}

export interface DevWatcherOptions {
  cwd: string;
  dirs: string[];
  ignore?: string[];
  onChange?: (events: WatchEvent[]) => void | Promise<void>;
  debounceMs?: number;
}

export interface DevWatcher {
  start(): void;
  stop(): void;
  addDir(dir: string): void;
}

export function createDevWatcher(options: DevWatcherOptions): DevWatcher {
  const { cwd, dirs, ignore = [], debounceMs = 100 } = options;
  const watchers: FSWatcher[] = [];
  const watchedDirs = new Set<string>();
  let pendingEvents: WatchEvent[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function isIgnored(relPath: string): boolean {
    return ignore.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(`^${  pattern.replace(/\*/g, '.*').replace(/\?/g, '.')  }$`);
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

  function watchDir(dir: string): void {
    if (watchedDirs.has(dir)) return;
    watchedDirs.add(dir);

    try {
      const w = watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = join(dir, filename);
        const type: WatchEvent['type'] = eventType === 'rename' ? 'unlink' : 'change';
        queueEvent(type, fullPath);
      });
      watchers.push(w);
    } catch {
      // directory might not exist yet
    }
  }

  function start(): void {
    for (const dir of dirs) {
      const fullDir = join(cwd, dir);
      watchDir(fullDir);
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
    watchDir(join(cwd, dir));
  }

  return { start, stop, addDir };
}
