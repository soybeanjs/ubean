/**
 * 作用域化失效的文件键解析（RM-V09）。
 *
 * 真实链路的端到端验证在 `packages/cli/test/dev-worker.test.ts`（真 env-runner worker + 真
 * dev server），但那个测试跑起来要几秒。这里用假模块图把**键的候选规则**钉死：Vite 的模块图
 * 按 `cleanUrl(resolvedId)` 建索引，即 realpath 后的路径；而 watcher 给出的是原始路径。
 * macOS 上 `os.tmpdir()` → `/var/folders/...`、realpath → `/private/var/folders/...`，
 * 只传原始路径必然落空 —— 这正是 RM-V09 卡住的原因，必须有回归守卫。
 */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { invalidateDevWorkerModules } from '@ubean/build/vite';
// pathe（不是 node:path）：模块图键与候选键都在 posix 形态上比对，期望值必须同形态。
import { join } from 'pathe';

let cleanup: string[] = [];

/** 与 `candidateFileKeys` 同规：模块图键一律 posix 形态（node:fs 在 Windows 上吐反斜杠）。 */
const toPosix = (p: string) => p.replace(/\\/g, '/');

afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

/** 只按给定的键建索引，模拟 Vite 的 fileToModulesMap。 */
function fakeEnvironment(keys: string[]) {
  const invalidated: string[] = [];
  const nodes = keys.map(key => ({ key, url: `/@fs/${key}`, mod: { url: `/@fs/${key}` } }));
  return {
    invalidated,
    environment: {
      moduleGraph: {
        getModulesByFile: (file: string) => nodes.filter(node => node.key === file).map(node => node.mod),
        invalidateModule: (mod: { url: string }) => void invalidated.push(mod.url)
      }
    }
  };
}

describe('invalidateDevWorkerModules 的文件键', () => {
  // 历史事故 #7（RM-V09）：Vite 的模块图按 `cleanUrl(resolvedId)`（realpath 后）建索引，
  // watcher 给的却是原始路径 → 只传原始路径必然落空，dev 热重载整体失效且**无任何报错**。
  // macOS 上 `os.tmpdir()` → `/var/folders/...`、realpath → `/private/var/folders/...`。
  it('realpath 索引的模块图：传原始路径也能命中', () => {
    const raw = mkdtempSync(join(tmpdir(), 'ubean-invalidate-'));
    cleanup.push(raw);
    const file = join(raw, 'changing.ts');
    writeFileSync(file, 'export const value = "v1";\n');

    // realpathSync 返回平台原生形态（Windows 反斜杠）；索引键须与 Vite 一致取 posix 形态
    const real = toPosix(realpathSync(file));
    // 只有 realpath 与原始路径不同时这个测试才有意义（macOS 上 /var → /private/var）
    if (real === file) return;

    const { environment, invalidated } = fakeEnvironment([real]);
    const result = invalidateDevWorkerModules(environment, { sendMessage: () => {} }, [file]);

    expect(result.urls).toHaveLength(1);
    expect(result.keys).toEqual([real]);
    expect(invalidated).toEqual([`/@fs/${real}`]);
  });

  it('两种候选键都会尝试：索引用符号链接路径时也能命中', () => {
    const raw = mkdtempSync(join(tmpdir(), 'ubean-invalidate-'));
    cleanup.push(raw);
    const link = join(raw, 'link');
    writeFileSync(join(raw, 'file.ts'), 'export const value = 1;\n');

    try {
      symlinkSync(raw, link, 'dir');
    } catch {
      return; // 平台不允许建符号链接就跳过
    }

    // 候选键为 [<符号链接路径>, <realpath>]，模块图按前者索引时应命中第一个候选
    const linkedFile = join(link, 'file.ts');
    const { environment, invalidated } = fakeEnvironment([linkedFile]);
    const result = invalidateDevWorkerModules(environment, { sendMessage: () => {} }, [linkedFile]);

    expect(result.urls).toEqual([`/@fs/${linkedFile}`]);
    expect(invalidated).toEqual([`/@fs/${linkedFile}`]);
  });

  // 历史事故 #9（2026-10-08 的 Windows CI）：候选链用 vite 的 `normalizePath`，而它在
  // `pathNeedsCleaning()` 为假时**原样返回** —— 那把判定把 `isWindows` 写死了，于是 Windows 上
  // 输入已是反斜杠形态，判定反而为假，`normalizePath('C:\a\b.ts')` 吐的还是反斜杠，而模块图键
  // （来自 resolve 后的 resolvedId）是正斜杠 → 查表必然落空，dev 热重载静默失效。
  // 本用例直接喂反斜杠形态，不依赖平台，所以在哪跑都能守住。
  it('反斜杠形态的输入被归一成正斜杠后才查表（Windows 上原先全部落空）', () => {
    const { environment, invalidated } = fakeEnvironment(['C:/a/ubean/src/state.ts']);
    const result = invalidateDevWorkerModules(environment, { sendMessage: () => {} }, ['C:\\a\\ubean\\src\\state.ts']);

    expect(result.keys).toEqual(['C:/a/ubean/src/state.ts']);
    expect(result.urls).toEqual(['/@fs/C:/a/ubean/src/state.ts']);
    expect(invalidated).toEqual(['/@fs/C:/a/ubean/src/state.ts']);
  });

  it('未命中的文件不通知 worker（避免无谓地重置入口缓存）', () => {
    const sent: unknown[] = [];
    const { environment, invalidated } = fakeEnvironment(['/somewhere/else.ts']);
    const result = invalidateDevWorkerModules(environment, { sendMessage: m => sent.push(m) }, ['/nope/missing.ts']);

    expect(result.urls).toEqual([]);
    expect(invalidated).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('命中后按 URL 通知 worker（宿主与 worker 唯一共识的标识）', () => {
    const sent: unknown[] = [];
    const { environment } = fakeEnvironment(['/app/src/state.ts']);
    const result = invalidateDevWorkerModules(environment, { sendMessage: m => sent.push(m) }, ['/app/src/state.ts']);

    expect(result.urls).toEqual(['/@fs//app/src/state.ts']);
    expect(sent).toEqual([{ type: 'ubean:invalidate', urls: ['/@fs//app/src/state.ts'] }]);
  });
});
