#!/usr/bin/env node
/**
 * 给现有译文补写 `translatedFrom` 源哈希标记（一次性回填 + 后续手工修订入口）。
 *
 * 漂移检测（`i18n-check.mjs`）靠比对「en 当前正文哈希」与 zh frontmatter 里的
 * `translatedFrom` 判断译文是否过期。现有译文没有这个字段，回填一次之后，
 * 检测才能开始工作 —— 否则首跑会把全站 29 篇都报成 stale，噪声淹没真问题。
 *
 * 用法：
 *   node scripts/i18n-stamp.mjs            # 只补写缺失的标记
 *   node scripts/i18n-stamp.mjs --force    # 全部重写（人工修订译文后用）
 *   node scripts/i18n-stamp.mjs --dry-run  # 只报告差异
 */
import { writeFileSync } from 'node:fs';
import {
  isTranslationStub,
  listSiteContent,
  readFrontmatterField,
  sectionHashes,
  sourceHash,
  splitFrontmatter
} from './i18n/lib.mjs';

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const dryRun = args.has('--dry-run');

/**
 * 在 frontmatter 末尾写入/替换 `translatedFrom` 与 `sections`，其余内容逐字不动。
 *
 * `sections` 是**分节指纹**，增量翻译（`i18n-translate.mjs`）据此只重译变了的节。
 * 没有它时翻译器只能整篇重译，而实测整篇重译会把已润色的译文降级。
 *
 * 不用 YAML 序列化整体重建：那会重排键序、改写 `description` 的引号风格，
 * 让每个文件都产生无意义的 diff。
 */
function stamp(source, hash, sections) {
  const { frontmatter, body } = splitFrontmatter(source);
  const fields = { translatedFrom: hash, sections: JSON.stringify(sections) };

  if (frontmatter === null) {
    const block = Object.entries(fields)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    return { source: `---\n${block}\n---\n${body}`, changed: true };
  }

  let next = frontmatter;
  for (const [key, value] of Object.entries(fields)) {
    const pattern = new RegExp(`^\\s*${key}\\s*:.*$`, 'mu');
    next = pattern.test(next) ? next.replace(pattern, `${key}: ${value}`) : `${next}\n${key}: ${value}`;
  }

  if (next === frontmatter) return { source, changed: false };
  return { source: `---\n${next}\n---${body}`, changed: true };
}

let stamped = 0;
let skipped = 0;
let stubbed = 0;

for (const item of listSiteContent()) {
  if (item.zh === null) {
    console.log(`· 无译文（待翻译）    ${item.slug}`);
    skipped += 1;
    continue;
  }

  // 占位页不算已翻译：给它盖章会让漂移检测误判「译文是最新的」。
  if (isTranslationStub(item.zh)) {
    console.log(`· 占位页（待翻译）    ${item.slug}`);
    stubbed += 1;
    continue;
  }

  const hash = sourceHash(item.en);
  const sections = sectionHashes(item.en);
  const existing = readFrontmatterField(splitFrontmatter(item.zh).frontmatter, 'translatedFrom');

  const { source, changed } = stamp(item.zh, hash, sections);
  if (!changed && !force) {
    skipped += 1;
    continue;
  }

  const reason = existing ? `更新 ${existing} → ${hash}` : `写入 ${hash}`;
  console.log(`✓ ${reason.padEnd(24)} ${item.slug}`);

  if (!dryRun) writeFileSync(item.zhPath, source, 'utf8');
  stamped += 1;
}

console.log();
console.log(
  `${dryRun ? '[dry-run] 将' : '已'}盖章 ${stamped} 篇，跳过 ${skipped} 篇${stubbed ? `，占位待译 ${stubbed} 篇` : ''}`
);

if (stubbed) {
  console.log(`提示：${stubbed} 篇仍是 status: translated-stub 占位页，需先翻译（见 apps/docs/TRANSLATION.md）。`);
}
