#!/usr/bin/env node
/**
 * 文档国际化门禁：缺译文 / 源漂移 / 结构不符 → 退出 1。
 *
 * 解决的问题是**静默漂移**：`en/` 一直在改，`zh/` 没跟上也没人知道。实测
 * en 内容有 43 次提交、zh 只有 38 次，差额就是已经发生的漂移；站点还有过
 * 17/29 篇是占位页却无人察觉的阶段。光「有 zh 文件」不够 —— 译文可能落后于
 * 源，甚至可能破坏结构。
 *
 * 三类问题，按严重度：
 *
 *   1. **缺译文**：zh 文件不存在，或是 `status: translated-stub` 占位页
 *   2. **源漂移**：en 正文的哈希与 zh frontmatter 的 `translatedFrom` 不符
 *   3. **结构不符**：标题层级 / 代码块语言 / 站内链接目标 / 表格行数 / 行内代码
 *      数量与 en 不一致（译文破坏了 markdown 结构）
 *
 * 用法：
 *   node scripts/i18n-check.mjs              # 全量检查，有问题退出 1（CI 用）
 *   node scripts/i18n-check.mjs --json       # 机器可读输出
 *   node scripts/i18n-check.mjs --summary    # 只打印计数
 *   node scripts/i18n-check.mjs --max-drift 5  # 容忍 N 篇漂移（渐进收敛期）
 *
 * 覆盖范围与「刻意不译」清单见 scripts/i18n/lib.mjs 的 NOT_TRANSLATED。
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  NOT_TRANSLATED,
  SITE_LOCALES_DIR,
  SOURCE_LOCALE,
  TARGET_LOCALE,
  diffStructure,
  isTranslationStub,
  listSiteContent,
  readFrontmatterField,
  sourceHash,
  splitFrontmatter
} from './i18n/lib.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const summaryOnly = args.includes('--summary');
const maxDrift = (() => {
  const at = args.indexOf('--max-drift');
  return at === -1 ? 0 : Number.parseInt(args[at + 1], 10) || 0;
})();

const problems = { missing: [], drifted: [], structure: [], locales: [] };

/* -------------------------------------------------------------------------- */
/* 1 + 2 + 3. 站点正文                                                          */
/* -------------------------------------------------------------------------- */

for (const item of listSiteContent()) {
  if (item.zh === null) {
    problems.missing.push({ slug: item.slug, why: 'zh 文件不存在' });
    continue;
  }

  // 占位页等同于「还没翻译」：它渲染的是英文正文 + 提示条，不是中文内容。
  if (isTranslationStub(item.zh)) {
    problems.missing.push({ slug: item.slug, why: 'status: translated-stub 占位页' });
    continue;
  }

  const expected = sourceHash(item.en);
  const actual = readFrontmatterField(splitFrontmatter(item.zh).frontmatter, 'translatedFrom');

  if (!actual) {
    problems.drifted.push({
      slug: item.slug,
      why: '缺少 translatedFrom 标记（跑 node scripts/i18n-stamp.mjs）',
      expected,
      actual: null
    });
  } else if (actual !== expected) {
    problems.drifted.push({
      slug: item.slug,
      why: 'en 正文已变更，译文未同步',
      expected,
      actual
    });
  }

  const structural = diffStructure(item.en, item.zh);
  if (structural.length) {
    problems.structure.push({ slug: item.slug, details: structural });
  }
}

/* -------------------------------------------------------------------------- */
/* 4. 站点消息目录                                                              */
/* -------------------------------------------------------------------------- */

/** 展平嵌套 JSON → `a.b.c` 键集合。 */
function flattenKeys(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
}

const messagesPath = locale => join(SITE_LOCALES_DIR, `${locale}.json`);

if (statSync(messagesPath(SOURCE_LOCALE), { throwIfNoEntry: false })?.isFile()) {
  const enKeys = new Set(flattenKeys(JSON.parse(readFileSync(messagesPath(SOURCE_LOCALE), 'utf8'))));
  const zhFile = messagesPath(TARGET_LOCALE);

  if (!statSync(zhFile, { throwIfNoEntry: false })?.isFile()) {
    problems.locales.push({ why: `缺少 ${TARGET_LOCALE}.json` });
  } else {
    const zhKeys = new Set(flattenKeys(JSON.parse(readFileSync(zhFile, 'utf8'))));
    for (const key of enKeys) {
      if (!zhKeys.has(key)) problems.locales.push({ key, why: 'zh 缺少该消息键' });
    }
    for (const key of zhKeys) {
      if (!enKeys.has(key)) problems.locales.push({ key, why: 'zh 有 en 不存在的键（可能是重命名残留）' });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 报告                                                                         */
/* -------------------------------------------------------------------------- */

const total = problems.missing.length + problems.drifted.length + problems.structure.length + problems.locales.length;

if (asJson) {
  console.log(JSON.stringify({ ok: total === 0, problems, notTranslated: NOT_TRANSLATED }, null, 2));
} else if (summaryOnly) {
  console.log(
    `缺译文 ${problems.missing.length} · 源漂移 ${problems.drifted.length} · ` +
      `结构不符 ${problems.structure.length} · 消息目录 ${problems.locales.length}`
  );
} else {
  const section = (title, rows, render) => {
    if (!rows.length) return;
    console.log(`\n${title}（${rows.length}）`);
    for (const row of rows) console.log(`  ${render(row)}`);
  };

  section('缺译文', problems.missing, p => `${p.slug} — ${p.why}`);
  section(
    '源漂移',
    problems.drifted,
    p => `${p.slug} — ${p.why}${p.actual ? `（zh: ${p.actual}，应为 ${p.expected}）` : `（应为 ${p.expected}）`}`
  );
  section('结构不符', problems.structure, p => `${p.slug}\n      ${p.details.join('\n      ')}`);
  section('站点消息目录', problems.locales, p => `${p.key ?? '-'} — ${p.why}`);

  if (total) {
    console.log('\n修复方式：');
    console.log('  · 源漂移 / 缺译文 → node scripts/i18n-translate.mjs <slug> 翻译，再跑 node scripts/i18n-stamp.mjs');
    console.log('  · 人工修过译文     → node scripts/i18n-stamp.mjs --force <slug> 重新盖章');
    console.log('  · 翻译规范         → apps/docs/TRANSLATION.md');
    console.log('\n刻意不翻译的面（非缺陷）：');
    for (const item of NOT_TRANSLATED) console.log(`  · ${item.path} — ${item.why}`);
  }
}

// 漂移容忍度作用于「源漂移」一类，便于渐进收敛；缺译文与结构问题不受容忍。
const blocking =
  problems.missing.length +
  problems.structure.length +
  problems.locales.length +
  Math.max(0, problems.drifted.length - maxDrift);

if (blocking > 0) {
  if (!asJson && !summaryOnly) {
    console.error(`\n✗ 文档国际化校验失败（${total} 项，其中阻断 ${blocking} 项）`);
  }
  process.exit(1);
}

if (!asJson && !summaryOnly) {
  console.log('\n✓ 文档国际化校验通过（译文齐备、无漂移、结构一致）');
}
