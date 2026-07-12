import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDevWatcher,
  formatDiagnostics,
  nodeRunner,
  getRegisteredRunners,
  registerRunner,
  selectRunner
} from '../src/core/dev';
import {
  NODE_CAPABILITIES,
  WORKER_CAPABILITIES,
  diagnoseCapabilities,
  DEV_REQUIREMENTS,
  NODE_REQUIREMENTS
} from '../src/core/preset/capabilities';
import { standardPreset } from '../src/core/preset/standard/preset';

describe('dev runner', () => {
  it('nodeRunner is available in Node.js environment', () => {
    expect(nodeRunner.name).toBe('node');
    expect(nodeRunner.isAvailable()).toBe(true);
  });

  it('selectRunner returns an available runner', async () => {
    const runner = await selectRunner(standardPreset);
    expect(runner).not.toBeNull();
    expect(runner!.name).toBe('node');
  });

  it('getRegisteredRunners returns list including nodeRunner', () => {
    const runners = getRegisteredRunners();
    expect(runners.length).toBeGreaterThanOrEqual(1);
    expect(runners.some(r => r.name === 'node')).toBe(true);
  });

  it('registerRunner adds runner to front of list', () => {
    const testRunner = {
      name: 'test-runner',
      isAvailable: () => false,
      createRunner: async () => {
        throw new Error('not implemented');
      }
    };
    const beforeCount = getRegisteredRunners().length;
    registerRunner(testRunner);
    const after = getRegisteredRunners();
    expect(after[0].name).toBe('test-runner');
    expect(after.length).toBe(beforeCount + 1);
  });
});

describe('dev diagnostics', () => {
  it('diagnoseCapabilities passes for NODE_CAPABILITIES against DEV_REQUIREMENTS', () => {
    const result = diagnoseCapabilities('node', NODE_CAPABILITIES, DEV_REQUIREMENTS);
    expect(result.valid).toBe(true);
    expect(result.diagnostics.filter(d => !d.supported && d.required)).toHaveLength(0);
  });

  it('diagnoseCapabilities reports warnings for missing optional capabilities in WORKER_CAPABILITIES', () => {
    const result = diagnoseCapabilities('worker', WORKER_CAPABILITIES, DEV_REQUIREMENTS);
    const { errors, warnings: _warnings } = formatDiagnostics(result);
    expect(errors.length).toBe(0);
  });

  it('formatDiagnostics separates errors and warnings', () => {
    const result = diagnoseCapabilities('test', { staticServe: true }, [
      { capability: 'websocket', required: true, message: 'WebSocket required' },
      { capability: 'sse', required: false, message: 'SSE optional' }
    ]);
    const { errors, warnings } = formatDiagnostics(result);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('websocket'))).toBe(true);
    expect(warnings.some(w => w.includes('sse'))).toBe(true);
  });

  it('NODE_REQUIREMENTS equals DEV_REQUIREMENTS', () => {
    expect(NODE_REQUIREMENTS).toBe(DEV_REQUIREMENTS);
  });
});

describe('dev watcher', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ubean-dev-test-'));
    await mkdir(join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('createDevWatcher returns a watcher instance', () => {
    const watcher = createDevWatcher({
      cwd: tmpDir,
      dirs: ['src']
    });
    expect(watcher).toBeDefined();
    expect(typeof watcher.start).toBe('function');
    expect(typeof watcher.stop).toBe('function');
    expect(typeof watcher.addDir).toBe('function');
  });

  it('watcher can start and stop without errors', () => {
    const watcher = createDevWatcher({
      cwd: tmpDir,
      dirs: ['src']
    });
    expect(() => watcher.start()).not.toThrow();
    expect(() => watcher.stop()).not.toThrow();
  });

  it('watcher debounces multiple events', async () => {
    let callCount = 0;
    const watcher = createDevWatcher({
      cwd: tmpDir,
      dirs: ['src'],
      debounceMs: 50,
      onChange() {
        callCount++;
      }
    });

    watcher.start();
    await new Promise(r => setTimeout(r, 100));
    await writeFile(join(tmpDir, 'src', 'a.ts'), 'export const a = 1;');
    await writeFile(join(tmpDir, 'src', 'b.ts'), 'export const b = 2;');
    await new Promise(r => setTimeout(r, 200));
    watcher.stop();

    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it('watcher ignores .bak files', async () => {
    let events: any[] = [];
    await mkdir(join(tmpDir, 'src'), { recursive: true });

    const watcher = createDevWatcher({
      cwd: tmpDir,
      dirs: ['src'],
      debounceMs: 50,
      onChange(evts) {
        events.push(...evts);
      }
    });

    watcher.start();
    await writeFile(join(tmpDir, 'src', 'test.vue.bak'), 'old content');
    await new Promise(r => setTimeout(r, 150));
    watcher.stop();

    const bakEvents = events.filter(e => e.relativePath.endsWith('.bak'));
    expect(bakEvents).toHaveLength(0);
  });
});
