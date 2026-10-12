/**
 * 每个包的双语 README 守卫。
 *
 * **为什么要有这个守卫**：`packages/<pkg>/README.md` + `README.zh-CN.md` 是发布到 npm 的包门面
 * （`files: ["dist"]` 之外用户第一眼看到的东西）。双语版本之间有四种静默漂移方式，全都不会
 * 让别的测试变红：
 *
 * 1. **缺一个**——只写了英文、中文忘了，或反过来。
 * 2. **标题结构分叉**——译文多了/少了一节，目录里于是指向不存在的锚点。
 * 3. **锚点悬空**——`## Table of Contents` 里的 `[Foo](#foo)` 对应的标题被改名/删除。
 * 4. **语言切换器写错**——`README.zh-CN.md` 是包内的文件名，写成 `README.zh_CN.md`（仓库**根**
 *    用的是下划线）就 404，而 npm 页面不会告诉你。
 *
 * 判据刻意写得宽松：只锁「结构」与「链接可解析」，不锁措辞、不锁长度、不锁代码块数量 ——
 * 译文允许与原文不同措辞，README 允许增删小节（只要两侧同增同减）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const packagesDir = join(repoRoot, 'packages');

interface Heading {
  level: number;
  text: string;
}

/** 抽出所有 ATX 标题。跳过代码围栏内的 `# 注释`（README 里 markdown 示例含 `# Guide content`）。 */
function headings(markdown: string): Heading[] {
  const out: Heading[] = [];
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (m) out.push({ level: m[1].length, text: m[2] });
  }
  return out;
}

/**
 * GitHub 风格锚点：小写、去标点、**每个**空白字符各变一个连字符。
 *
 * 最后一个细节不能省：`## Page Transitions & Reload` 的锚点是
 * `#page-transitions--reload`（`&` 被删掉后留下两个空格 → 两个连字符），
 * 把连续空白折叠成单个连字符会误报 `@ubean/vue` 的目录锚点悬空。
 */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** markdown 里的页内链接 `[text](#anchor)`。 */
function anchorLinks(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/\]\(#([^)\s]+)\)/g)) out.push(m[1]);
  return out;
}

/** markdown 里的相对文件链接（排除 http(s)/mailto 与纯锚点）。 */
function relativeLinks(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g)) out.push(m[1]);
  return out;
}

const packages = readdirSync(packagesDir)
  .filter(name => {
    const dir = join(packagesDir, name);
    return statSync(dir).isDirectory() && existsSync(join(dir, 'package.json'));
  })
  .sort();

describe('包 README 双语门禁', () => {
  it('每个包都同时有 README.md 与 README.zh-CN.md，且都非空', () => {
    const missing: string[] = [];
    const empty: string[] = [];
    for (const name of packages) {
      for (const file of ['README.md', 'README.zh-CN.md']) {
        const path = join(packagesDir, name, file);
        if (!existsSync(path)) missing.push(`packages/${name}/${file}`);
        else if (readFileSync(path, 'utf8').trim().length < 200) empty.push(`packages/${name}/${file}`);
      }
    }
    expect(missing, '缺少的 README').toEqual([]);
    expect(empty, '过短（<200 字符）的 README').toEqual([]);
  });

  it('英文与中文 README 的标题层级序列逐项一致', () => {
    const mismatched: string[] = [];
    for (const name of packages) {
      const enPath = join(packagesDir, name, 'README.md');
      const zhPath = join(packagesDir, name, 'README.zh-CN.md');
      if (!existsSync(enPath) || !existsSync(zhPath)) continue;
      const en = headings(readFileSync(enPath, 'utf8'));
      const zh = headings(readFileSync(zhPath, 'utf8'));
      if (en.length !== zh.length) {
        mismatched.push(`packages/${name}: 标题数 ${en.length} (en) != ${zh.length} (zh)`);
        continue;
      }
      // 标题**文案**允许翻译，只比层级序列与 H1 之后的相对顺序。
      const enShape = en.map(h => h.level).join(',');
      const zhShape = zh.map(h => h.level).join(',');
      if (enShape !== zhShape) {
        mismatched.push(`packages/${name}: 标题层级序列 ${enShape} (en) != ${zhShape} (zh)`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('每个 README 的目录锚点都指向本文件内存在的标题', () => {
    const dangling: string[] = [];
    for (const name of packages) {
      for (const file of ['README.md', 'README.zh-CN.md']) {
        const path = join(packagesDir, name, file);
        if (!existsSync(path)) continue;
        const text = readFileSync(path, 'utf8');
        const available = new Set(headings(text).map(h => slug(h.text)));
        for (const anchor of anchorLinks(text)) {
          if (!available.has(anchor)) dangling.push(`packages/${name}/${file}: #${anchor}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it('相对文件链接都存在（含语言切换器指向的兄弟 README）', () => {
    const broken: string[] = [];
    for (const name of packages) {
      const dir = join(packagesDir, name);
      for (const file of ['README.md', 'README.zh-CN.md']) {
        const path = join(dir, file);
        if (!existsSync(path)) continue;
        const text = readFileSync(path, 'utf8');
        for (const link of relativeLinks(text)) {
          const target = resolve(dir, decodeURIComponent(link.split('#')[0]));
          if (!existsSync(target)) broken.push(`packages/${name}/${file}: ${link}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('语言切换器：英文页链到 ./README.zh-CN.md，中文页链到 ./README.md', () => {
    const wrong: string[] = [];
    for (const name of packages) {
      const enPath = join(packagesDir, name, 'README.md');
      const zhPath = join(packagesDir, name, 'README.zh-CN.md');
      if (!existsSync(enPath) || !existsSync(zhPath)) continue;
      // 只看文件头部（切换器必须在正文之前）。
      const enHead = readFileSync(enPath, 'utf8').split('\n').slice(0, 12).join('\n');
      const zhHead = readFileSync(zhPath, 'utf8').split('\n').slice(0, 12).join('\n');
      if (!enHead.includes('](./README.zh-CN.md)')) wrong.push(`packages/${name}/README.md`);
      if (!zhHead.includes('](./README.md)')) wrong.push(`packages/${name}/README.zh-CN.md`);
    }
    expect(wrong).toEqual([]);
  });
});
