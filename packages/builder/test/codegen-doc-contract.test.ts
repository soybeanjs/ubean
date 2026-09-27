import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CODEGEN_CONTRACT_VERSION, CODEGEN_FILES } from '../src/codegen/index';

/**
 * `docs/contracts/codegen-v1.md` 是 `.ubean/` codegen 的对外冻结契约（studio / IDE 插件按它读产物）。
 * 它此前漏列了真实存在的 `virtual-components.d.ts`，而没有任何东西会发现 —— 这个用例把「文档契约
 * 与 CODEGEN_FILES 一致」变成可执行断言，避免同一个漂移复发。
 *
 * 只断言「每个契约文件在文档里被提到 + 版本号一致」，不解析 Markdown 表格：
 * 表格排版会变，文件清单不能变。
 */
const DOC_PATH = fileURLToPath(new URL('../../../docs/contracts/codegen-v1.md', import.meta.url));

describe('docs/contracts/codegen-v1.md 与 CODEGEN_FILES', () => {
  const doc = readFileSync(DOC_PATH, 'utf8');

  it('逐个列出 CODEGEN_FILES 的每个文件', () => {
    const missing = CODEGEN_FILES.filter(file => !doc.includes(`\`${file.name}\``)).map(f => f.name);
    expect(missing, `文档缺以下契约文件：${missing.join(', ')}`).toEqual([]);
  });

  it('声明同一个 contractVersion', () => {
    expect(doc).toContain(`contractVersion\`: **${CODEGEN_CONTRACT_VERSION}**`);
    expect(CODEGEN_CONTRACT_VERSION).toBe(1);
  });

  it('不透支清单外的契约文件（列出但代码里没有 → 文档幻想）', () => {
    // 只检查 `## Files` 表（`generateTypes()` 的契约面）；后面的
    // 「Optional / not written by `generateTypes()`」表按定义就含清单外的文件。
    const filesSection = doc.split(/^## Optional/m)[0] ?? '';
    const declared = [...filesSection.matchAll(/`([a-z-]+\.d\.ts)`/g)].map(m => m[1]);
    const known = new Set(CODEGEN_FILES.map(f => f.name));
    const phantom = [...new Set(declared)].filter(name => !known.has(name));
    expect(phantom, `文档声明了不存在的契约文件：${phantom.join(', ')}`).toEqual([]);
  });
});
