/**
 * 跨平台解析 `vp` CLI 的真实 JS 入口。
 *
 * `node_modules/.bin/vp` 是 pnpm 生成的 **sh shim**（POSIX 专属）：Windows 上 `spawn(vp)`
 * 直接 ENOENT（实测 2026-10 Windows CI：preview-vite「服务器提前退出（exit -4058）」、
 * vite-build「Hook timed out in 300000ms」—— run() 的 promise 永不 settle）。
 *
 * 真入口是 `vite-plus/bin/vp`：纯 ESM JS（`await import('../dist/bin.js')`，shebang 会被
 * Node 当注释忽略），用 `process.execPath` 直接跑，POSIX / Windows 通吃。
 *
 * 解析锚点用仓库根的 package.json（与 `.bin/vp` 的解析上下文一致），不依赖 pnpm 的
 * `.pnpm` 哈希目录名。
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export function resolveVpEntry(repoRoot: string): string {
  const req = createRequire(join(repoRoot, 'package.json'));
  const pkgJson = req.resolve('vite-plus/package.json');
  return join(dirname(pkgJson), 'bin/vp');
}
