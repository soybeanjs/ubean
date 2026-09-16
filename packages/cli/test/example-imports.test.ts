/**
 * 示例项目里客户端图文件的导入纪律（AGENTS §8 的「尺寸陷阱」）。
 *
 * **为什么要有这个守卫**：主入口 `ubean` 是 isValid 的聚合 barrel（shared/seo/pages/markdown +
 * Vue 内核 + islands + logger）。客户端模块为了取其中一个小东西而从它导入时，打包器会把整条聚合链
 * 带进客户端产物 —— 实测两次：`defineMatcher`（入口 chunk 45.2 → 111.9 kB gzip）、`schemaOrg`
 * （total +63.7%）。两次都是 `pnpm analyze:check` 抓到的，但那要等一次完整构建；这条用例把它变成
 * 立即反馈。
 *
 * 判据只看**主入口**：`ubean/client`（唯一的客户端入口）、`ubean/server`（服务端宏，客户端侧会被
 * actions 插件剥离）、`ubean/build`（构建期，只应出现在脚本/CI）都不在这里拦。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const srcDir = join(repoRoot, 'examples/ubean-test/src');

/** 参与客户端构建的目录/文件（SSR 也用同一份源码，因此都算「客户端图」）。 */
const CLIENT_GRAPH_ENTRIES = ['pages', 'components', 'layouts', 'app.ts', 'entry.client.ts'];

function collectFiles(entry: string): string[] {
  const full = join(srcDir, entry);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return [];
  }
  if (stat.isFile()) return [full];
  const out: string[] = [];
  for (const child of readdirSync(full)) {
    out.push(...collectFiles(join(entry, child)));
  }
  return out;
}

describe('示例项目：客户端图文件的导入纪律', () => {
  it('不从主入口 `ubean` 导入（应使用 `ubean/client` 等子路径）', () => {
    const offenders: string[] = [];
    for (const entry of CLIENT_GRAPH_ENTRIES) {
      for (const file of collectFiles(entry)) {
        if (!/\.(ts|vue|md)$/.test(file)) continue;
        const code = readFileSync(file, 'utf-8');
        // 只匹配裸主入口：`from 'ubean'` / `from "ubean"`（子路径 `ubean/client` 不匹配）
        if (/(?:from|import)\s*\(?\s*['"]ubean['"]/.test(code)) {
          offenders.push(relative(repoRoot, file));
        }
      }
    }
    expect(
      offenders,
      `这些文件从主入口 ubean 导入，会把整条聚合链带进客户端产物（改用 ubean/client）：\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
