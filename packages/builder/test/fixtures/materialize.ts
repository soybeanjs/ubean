/**
 * TS-29：把共享 fixture 复制成**每个 suite 独占**的一份，让并行跑文件是安全的。
 *
 * ## 为什么不能直接用 `test/fixtures/<name>`
 *
 * `production-build.test.ts` 与 `cloudflare-preview.test.ts` 都用 `build-project` 这个
 * fixture，而构建会在 fixture 里写**同一批中间产物**：`.ubean/**`（虚拟模块、codegen 的
 * `components.d.ts` / `openapi.d.ts`）与各自的 outDir。并行时它们互相踩 —— 实测两者在时间
 * 线上真的重叠（cloudflare-preview 0.00→3.62s、production-build 1.06→2.59s，重叠 1.5s），
 * 且 `production-build` 的 `afterEach` 会在 cloudflare 还在构建时删掉 `.ubean`。跑 6 次都
 * 绿，但那是时序运气，不是隔离。
 *
 * ## 为什么也不能用 `os.tmpdir()`
 *
 * 工作区之外的目录里，Vite 的依赖解析会失败（`dev-request-bootstrap.test.ts:30` 与
 * `production-build.test.ts:16` 都记录了这条：`extractExportsData` 对 `vue-i18n` 这类包
 * 算出包内相对路径再去读，直接 ENOENT）。所以复制目标必须仍在仓库内，才能走上正常的
 * `node_modules` 向上查找链。
 *
 * 折中：复制到仓库根的 `.temp/`（已 gitignore）下，每个 suite 一个带随机后缀的目录。
 * 既在仓库内（依赖解析正常），又互不共享（并行安全）。
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** 仓库根的 `.temp/`（`.gitignore:47` 的 `.temp` 覆盖此处）。 */
const TEMP_ROOT = resolve(import.meta.dirname, '../../../../.temp');

/**
 * 复制 fixture 到本 suite 独占的临时目录。
 *
 * @param name fixture 目录名（相对 `test/fixtures/`），例如 `build-project`
 * @param label suite 标识，进目录名便于失败时定位
 * @returns 复制出的目录绝对路径
 */
export function materializeFixture(name: string, label: string): string {
  const dest = join(TEMP_ROOT, `fixture-${name}-${label}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(TEMP_ROOT, { recursive: true });
  cpSync(resolve(import.meta.dirname, name), dest, {
    recursive: true,
    // fixture 里的 `node_modules/` 只有 miniflare 的 `.mf` 缓存与 Vite 的 `.vite` 预构建缓存，
    // 都是机器生成的；复制它们既慢又可能带上陈旧状态。
    filter: source => !source.includes('node_modules')
  });
  return dest;
}

/** 删除 `materializeFixture` 产出的目录（suite 的 `afterAll` 里调用）。 */
export function removeMaterializedFixture(dir: string): void {
  // 只删本模块产出的目录。
  //
  // 这条护栏不是多余的：做红证时曾把 `materializeFixture` 临时退化成「返回共享 fixture 路径」
  // （用 env 开关模拟未隔离），`afterAll` 于是把 `test/fixtures/build-project/` 整个删掉了 ——
  // 而那是**入仓的** fixture，下一轮测试直接 `ENOENT: lstat .../build-project`。清理函数永远
  // 不该相信传入路径，尤其是当它的返回值会被测试代码用环境变量改写时。
  if (!resolve(dir).startsWith(`${TEMP_ROOT}/`)) return;
  rmSync(dir, { recursive: true, force: true });
}
