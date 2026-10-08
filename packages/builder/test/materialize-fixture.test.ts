/**
 * TS-29 的 fixture 副本助手自身的回归守卫。
 *
 * 这个文件存在的理由是一次**真实的自伤**：做 TS-29 红证时把 `materializeFixture` 临时改成
 * 「返回共享 fixture 路径」（用 env 开关模拟未隔离的旧行为），于是 suite 的 `afterAll` 里的
 * `removeMaterializedFixture(FIXTURE)` 把 `test/fixtures/build-project/` **整个删掉了** ——
 * 那是入仓的 fixture。下一轮测试报 `ENOENT: no such file or directory, lstat
 * '.../test/fixtures/build-project'`，看起来像「fixture 不见了」，而不是「清理函数越界」。
 *
 * 所以清理函数必须自己判断「这个路径是不是我产出的」，而不是相信调用方传进来的东西。
 * 本文件把这条判据钉住：传入仓内 fixture 路径时必须是空操作。
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// pathe（不是 node:path）：`materializeFixture` 的返回值走 pathe（正斜杠），`tempRoot` 也必须
// 同形态 —— node:path 在 Windows 上吐反斜杠，`dir.startsWith(`${tempRoot}/`)` 必然 false。
import { join, resolve } from 'pathe';
import { materializeFixture, removeMaterializedFixture } from './fixtures/materialize';

const fixtureRoot = resolve(import.meta.dirname, 'fixtures');
const sharedFixture = join(fixtureRoot, 'build-project');
const tempRoot = resolve(import.meta.dirname, '../../../.temp');

describe('materializeFixture', () => {
  it('把 fixture 复制到仓库 .temp/ 下的独占目录，且不带 node_modules', () => {
    const dir = materializeFixture('build-project', 'self-test');
    try {
      // 必须在 `.temp/` 下 —— 留在仓内是 Vite 依赖解析能工作的前提（`os.tmpdir()` 会 ENOENT）。
      expect(dir.startsWith(`${tempRoot}/`)).toBe(true);
      expect(existsSync(join(dir, 'package.json'))).toBe(true);
      expect(existsSync(join(dir, 'src/pages/index.vue'))).toBe(true);
      expect(existsSync(join(dir, 'node_modules'))).toBe(false);
    } finally {
      removeMaterializedFixture(dir);
    }
    expect(existsSync(dir)).toBe(false);
  });

  it('两次调用互不共享目录', () => {
    const first = materializeFixture('build-project', 'self-test-a');
    const second = materializeFixture('build-project', 'self-test-b');
    try {
      expect(first).not.toBe(second);
      // 两个副本之间没有硬链接或共享目录：改一个不影响另一个。
      writeFileSync(join(first, 'probe.txt'), 'a');
      expect(existsSync(join(second, 'probe.txt'))).toBe(false);
    } finally {
      removeMaterializedFixture(first);
      removeMaterializedFixture(second);
    }
  });

  it('清理函数对仓内 fixture 路径是空操作（红证自伤的那条护栏）', () => {
    // 这条断言就是那次事故的判据：清理函数永远不该删掉入仓的 fixture。
    expect(existsSync(sharedFixture), '入仓的 fixture 必须在').toBe(true);
    removeMaterializedFixture(sharedFixture);
    expect(existsSync(join(sharedFixture, 'package.json')), '清理函数不应删除仓内 fixture').toBe(true);
    expect(existsSync(join(sharedFixture, 'src/pages/index.vue'))).toBe(true);
  });

  it('清理函数同样不碰 .temp/ 之外的任意目录', () => {
    const outsider = mkdtempSync(join(resolve(import.meta.dirname), '.materialize-outsider-'));
    mkdirSync(join(outsider, 'inner'), { recursive: true });
    try {
      removeMaterializedFixture(outsider);
      expect(existsSync(join(outsider, 'inner')), '非 .temp/ 下的目录不应被清理').toBe(true);
    } finally {
      rmSync(outsider, { recursive: true, force: true });
    }
  });
});
