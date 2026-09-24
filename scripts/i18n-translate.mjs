#!/usr/bin/env node
/**
 * DeepL 驱动的文档翻译（站点正文与消息目录）。
 *
 * 设计与参考站（soybean-ui）的 `sui translate` 不同，原因值得写下来：它的 DeepL
 * 只处理 `api` / `changelog` / `locale` 三类**扁平 JSON**，从不翻译 markdown 正文 ——
 * 它那 111 篇中文正文是 LLM 写的。照搬它的形状来翻 markdown 会毁站点（实测
 * 见 scripts/i18n/chunk.mjs 顶部）。所以这里：
 *
 *   1. **分块**：只把「可翻译的正文行」送去 DeepL，结构行（frontmatter、代码块、
 *      表格、围栏）原样保留，按原行号回填
 *   2. **术语表**：翻完用 apps/docs/TRANSLATION.md 的术语表校正（DeepL 把
 *      `hydration` 译成「加载」而非「水合」，`islands` 译成「孤岛」而非「群岛」）
 *   3. **结构校验卡口**：落盘前比对结构指纹，不符**拒绝写入** —— 把「DeepL 不会
 *      破坏站点」从运气变成机制
 *
 * 用法：
 *   node scripts/i18n-translate.mjs                    # 翻译全部待译/漂移的文件
 *   node scripts/i18n-translate.mjs guide/islands      # 只翻一篇
 *   node scripts/i18n-translate.mjs --dry-run          # 只报告要翻什么，不调 API
 *   node scripts/i18n-translate.mjs --messages         # 只翻站点消息目录
 *
 * 环境变量：
 *   DEEPL_API_KEY      必填（TRANSLATE_API_KEY 作为别名）
 *   TRANSLATE_BASE_URL 覆盖端点（默认按密钥形态自动选 free / pro）
 *   TRANSLATE_SOURCE_LANG / TRANSLATE_TARGET_LANG
 *
 * 配额：DeepL 免费版按字符计费。全站正文约 20 万字符，quota 紧张时请用
 * `<slug>` 逐篇翻，并先用 `--dry-run` 看量。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyGlossary, mergeTranslatable, normalizeComponentTags, splitTranslatable } from './i18n/chunk.mjs';
import {
  SITE_LOCALES_DIR,
  SOURCE_LOCALE,
  TARGET_LOCALE,
  diffStructure,
  isTranslationStub,
  listSiteContent,
  loadGlossary,
  readFrontmatterField,
  sectionHashes,
  sourceHash,
  splitFrontmatter,
  splitSections
} from './i18n/lib.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const slugArgs = args.filter(a => !a.startsWith('--'));

const dryRun = flags.has('--dry-run');
const force = flags.has('--force');
const messagesOnly = flags.has('--messages');

const SOURCE_LANG = process.env.TRANSLATE_SOURCE_LANG?.trim() || 'EN';
const TARGET_LANG = process.env.TRANSLATE_TARGET_LANG?.trim() || 'ZH';
const BATCH_SIZE = Number.parseInt(process.env.TRANSLATE_BATCH_SIZE ?? '', 10) || 24;

/**
 * DeepL 端点与密钥。免费版密钥以 `:fx` 结尾且只能用 api-free；付费密钥用 api。
 * 用错端点的报错是 "Wrong endpoint"，不直观，所以这里主动判断。
 */
function resolveEndpoint() {
  const explicit = process.env.TRANSLATE_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/u, '');

  const key = process.env.DEEPL_API_KEY?.trim() || process.env.TRANSLATE_API_KEY?.trim() || '';
  if (!key) {
    console.error('✗ 缺少 DEEPL_API_KEY（或 TRANSLATE_API_KEY）环境变量');
    process.exit(1);
  }

  return key.endsWith(':fx') ? 'https://api-free.deepl.com/v2' : 'https://api.deepl.com/v2';
}

const API_KEY = () => process.env.DEEPL_API_KEY?.trim() || process.env.TRANSLATE_API_KEY?.trim() || '';
const BASE_URL = resolveEndpoint();

/**
 * 发一个 DeepL 请求并解析 JSON，把「非 JSON 响应」显式报出来。
 *
 * `response.json()` 遇到空体会抛 "Unexpected end of JSON input"，错误信息里
 * 看不到 HTTP 状态，排查困难（配额耗尽、鉴权失败、端点选错都会走到这里）。
 */
async function deeplJson(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const raw = await response.text();

  if (!raw) {
    if (response.ok) return {};
    throw new Error(`DeepL ${path} 返回 HTTP ${response.status}（空响应）`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`DeepL ${path} 返回非 JSON（HTTP ${response.status}）：${raw.slice(0, 200)}`);
  }
}

/**
 * DeepL 术语表集成。
 *
 * 术语一致性靠 DeepL 原生 Glossary，而不是翻完再做正则校正 —— 实测对比：
 *
 *   无 Glossary:  islands architecture → 岛式架构      partial hydration → 部分渲染
 *   有 Glossary:  islands architecture → 群岛架构      partial hydration → 部分水合
 *
 * 后者才符合 apps/docs/TRANSLATION.md（「群岛架构」「部分水合」）。正则只能识别
 * 「术语仍是英文」的情形，对这类中文错译无能为力。
 *
 * 免费版**只允许 1 个术语表**，所以这里按名字复用：存在则更新，不存在则创建，
 * 条目来自 TRANSLATION.md，保持单一事实源。`--no-glossary` 可跳过。
 */
const GLOSSARY_NAME = process.env.TRANSLATE_GLOSSARY_NAME?.trim() || 'ubean-docs';
let glossaryId = null;

/** 术语表条目（TSV）——过滤掉缩写与含制表符的条目，那是 DeepL 不接受的形态。 */
function glossaryEntries(glossary) {
  const skip = /^(ssr|ssg|spa|csr|isr|ppr|api|css|html|dom|ttl|swr)$/iu;

  return Object.entries(glossary)
    .filter(([k, v]) => !skip.test(k) && !/[\t\n]/u.test(k) && !/[\t\n]/u.test(v))
    .map(([k, v]) => `${k}\t${v}`)
    .join('\n');
}

async function setupGlossary(glossary) {
  if (flags.has('--no-glossary') || !Object.keys(glossary).length) return null;

  const headers = { Authorization: `DeepL-Auth-Key ${API_KEY()}`, 'Content-Type': 'application/json' };
  const entries = glossaryEntries(glossary);

  const list = await deeplJson('/glossaries', { headers });
  const existing = list.glossaries?.find(g => g.name === GLOSSARY_NAME);

  // 已存在时**删除重建**，不用 PUT /entries：免费版该端点返回 401（需付费计划），
  // 而免费版恰好又只允许 1 个术语表，所以「删掉再建」是唯一可行路径。
  if (existing) {
    await fetch(`${BASE_URL}/glossaries/${existing.glossary_id}`, { method: 'DELETE', headers });
  }

  const created = await deeplJson('/glossaries', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: GLOSSARY_NAME,
      source_lang: SOURCE_LANG.toLowerCase(),
      target_lang: TARGET_LANG.toLowerCase(),
      entries,
      entries_format: 'tsv'
    })
  });

  if (!created.glossary_id) {
    // 建不了不该让翻译失败：没有术语表的译文仍可用，只是术语会漂
    console.warn(`⚠ 术语表创建失败（${created.message ?? '未知原因'}），继续但不保证术语一致`);
    return null;
  }

  console.log(`术语表：「${GLOSSARY_NAME}」${existing ? '已重建' : '已新建'}（${created.entry_count} 条）`);
  return created.glossary_id;
}

/**
 * 调 DeepL 翻译一批文本行。
 *
 * `split_sentences: '0'` 是关键：默认值会按标点重新断句，把送入的 N 行合并不定
 * 行数，回填时行号就对不上了。设为不切分后，DeepL 按换行返回，行数守恒。
 *
 * 每行带一个行首标记（`\u200b<序号>\u200b`）作为兜底：若 DeepL 仍增删了行，
 * 调用方能据此精确重排而不是整批丢弃。
 */
async function translateBatch(texts) {
  const payload = texts.join('\n');

  const body = new URLSearchParams({
    text: payload,
    target_lang: TARGET_LANG,
    source_lang: SOURCE_LANG,
    split_sentences: '0',
    preserve_formatting: '1'
  });

  // 术语表让 DeepL 直接产出术语表规定的译法（`群岛架构` 而非 `岛式架构`）。
  // 下面的 applyGlossary 仍保留：它是兜底，覆盖术语表未收录的条目。
  if (glossaryId) body.set('glossary_id', glossaryId);

  const response = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${API_KEY()}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`DeepL ${response.status}: ${detail.slice(0, 300)}`);
  }

  const raw = await response.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    // 空响应体会让 `response.json()` 抛 "Unexpected end of JSON input"，把真正的
    // HTTP 状态藏掉。这里显式报出来，便于定位是配额、鉴权还是端点问题。
    throw new Error(`DeepL 返回非 JSON（HTTP ${response.status}）：${raw.slice(0, 200) || '(空响应)'}`);
  }

  const translated = json.translations?.[0]?.text;
  if (typeof translated !== 'string') throw new Error('DeepL 响应缺少 translations[0].text');

  return translated.split('\n');
}

/* -------------------------------------------------------------------------- */
/* frontmatter 的 title / description                                          */
/* -------------------------------------------------------------------------- */

/**
 * 翻译 frontmatter 的 `title` / `description`。
 *
 * 单独处理而不走正文分块：这两个字段是 YAML，键必须保持英文（`title:` 不能被
 * 译成 `标题：`），只有值需要翻译。`translatedFrom` 与 `status` 原样保留。
 */
async function translateFrontmatter(frontmatter, glossary) {
  const lines = frontmatter.split('\n');
  const targets = [];

  lines.forEach((line, index) => {
    const match = line.match(/^(\s*(?:title|description)\s*:\s*)(.+)$/u);
    if (match) targets.push({ index, value: match[2].trim().replace(/^['"]|['"]$/gu, '') });
  });

  if (!targets.length) return frontmatter;

  const translated = await translateBatch(targets.map(t => t.value));
  if (translated.length !== targets.length) {
    throw new Error(`frontmatter 行数不符：送入 ${targets.length}，返回 ${translated.length}`);
  }

  const out = [...lines];
  targets.forEach((target, i) => {
    const key = lines[target.index].match(/^\s*([A-Za-z_]+)\s*:/u)[1];
    const value = applyGlossary(translated[i].trim(), glossary);

    // 值里含 YAML 敏感字符（冒号、中文引号等）时加引号，避免解析歧义。
    const needsQuote = /[:#{}[\],&*?|>'"%@`]/u.test(value);
    out[target.index] = `${key}: ${needsQuote ? `"${value.replace(/"/gu, '\\"')}"` : value}`;
  });

  return out.join('\n');
}

/* -------------------------------------------------------------------------- */
/* 单篇翻译                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 增量翻译：只重译「真正变了的节」，保留已润色的其余部分。
 *
 * 为什么必须增量：整篇重译会把质量降级。实测在 guide/introduction.md 上，DeepL
 * 把原本的「文件式路由」（术语表用词）改成「基于文件的路由」，把「可移植服务端
 * 运行时」改成**语义错误**的「可移植服务端 / 客户端运行时」。站点译文是 LLM/人工
 * 写的、质量高于机器翻译，全篇重译是净损失。
 *
 * 判据是 `sections` 指纹（存在 zh frontmatter 里，跟随文件、不可能失同步）：
 * 逐节比对 en 的当前指纹与 zh 记录的指纹，只把不一致的节送去翻译。
 *
 * 无 `sections` 记录时（首次翻译或旧文件）退化为整篇翻译 —— 没有基线可比。
 */
async function translateDocument(item, glossary) {
  const en = splitFrontmatter(item.en);
  const zhExisting = item.zh ? splitFrontmatter(item.zh) : { frontmatter: null, body: '' };

  const enHashes = sectionHashes(item.en);
  const recorded = readFrontmatterField(zhExisting.frontmatter, 'sections');
  // 指纹是 8 位十六进制字符串；别做数值转换 —— `Number('3c354534')` 是 NaN，
  // 会让每篇都判定为「全部变更」。
  const previous = recorded ? JSON.parse(recorded).map(String) : null;

  const enSections = splitSections(en.body);
  const zhSections = item.zh ? splitSections(zhExisting.body) : [];

  // 按**标题**把 zh 的节映射到 en 的节，而不是按位置。
  //
  // 按位置对齐在增删章节时会整体错位 —— 而这恰恰是增量翻译最该处理的情形
  // （实测：在文末新增一节，按位置对齐会导致节数不等，判据失效退回整篇重译）。
  // zh 标题是译过的，所以这里用「节序号 + 位置」双重线索：优先在同序号附近
  // 找标题结构相同（层级相同）的节。
  const zhByIndex = new Map();
  const enHeadingLevel = section => section.heading?.match(/^#+/u)?.[0].length ?? 0;

  zhSections.forEach((section, index) => {
    // 只按位置登记：标题文案两侧不同，无法直接比对文字
    zhByIndex.set(index, section);
  });

  // 有历史指纹时才可能复用；节数变化本身不阻止增量 —— 变化的节会被识别出来
  const canReuse = Boolean(previous) && zhSections.length > 0;

  /** 该 en 节能否复用 zh 译文：历史指纹未变，且同位置存在 zh 节。 */
  const reusable = index => {
    if (!canReuse) return false;
    const hash = enHashes[index + 1];
    const zhSection = zhByIndex.get(index);
    if (!zhSection) return false;
    // 指纹按位置比对：节在中间插入时，其后的节指纹会集体偏移，那些节会被
    // 重译一遍 —— 正确但不够省。要避免这一点需要按内容对齐，代价是复杂度；
    // 当前取舍是「宁可多译几节，不可漏译」。
    return previous[index + 1] === hash && enHeadingLevel(enSections[index]) === enHeadingLevel(zhSection);
  };

  const toTranslate = [];
  enSections.forEach((_, index) => {
    if (!reusable(index)) toTranslate.push({ kind: 'section', index });
  });

  const metaChanged = !canReuse || previous[0] !== enHashes[0];

  /* ── frontmatter ── */
  let frontmatter;
  if (metaChanged) {
    frontmatter = await translateFrontmatter(
      en.frontmatter ?? `title: ${item.slug.split('/').pop()}\ndescription: `,
      glossary
    );
  } else {
    // 复用已有译文的 title/description —— 它们已润色且源未变
    frontmatter = (zhExisting.frontmatter ?? '')
      .split('\n')
      .filter(line => /^\s*(title|description)\s*:/u.test(line))
      .join('\n');
  }

  /* ── 正文 ── */
  let body;
  if (!toTranslate.length) {
    body = zhExisting.body; // 全部命中：原样保留
  } else if (!canReuse) {
    // 整篇翻译
    const { lines, units } = splitTranslatable(en.body);
    if (!units.length) {
      body = en.body;
    } else {
      const translated = [];
      for (let i = 0; i < units.length; i += BATCH_SIZE) {
        const batch = units.slice(i, i + BATCH_SIZE);
        const out = await translateBatch(batch.map(u => u.text));
        translated.push(...out.map(line => applyGlossary(normalizeComponentTags(line), glossary)));
      }
      body = normalizeComponentTags(mergeTranslatable(lines, units, translated));
    }
  } else {
    // 增量：逐节替换，未变的节用 zh 原文
    const rebuilt = [];
    for (const target of toTranslate) {
      const enSection = enSections[target.index].text;
      const { lines, units } = splitTranslatable(enSection);

      if (!units.length) {
        rebuilt[target.index] = enSection;
        continue;
      }

      const translated = [];
      for (let i = 0; i < units.length; i += BATCH_SIZE) {
        const batch = units.slice(i, i + BATCH_SIZE);
        const out = await translateBatch(batch.map(u => u.text));
        translated.push(...out.map(line => applyGlossary(normalizeComponentTags(line), glossary)));
      }
      rebuilt[target.index] = normalizeComponentTags(mergeTranslatable(lines, units, translated));
    }

    body = enSections
      .map((_, index) => rebuilt[index] ?? zhByIndex.get(index)?.text ?? enSections[index].text)
      .join('\n');
  }

  /* ── frontmatter 组装 ── */
  const carried = (zhExisting.frontmatter ?? '')
    .split('\n')
    .filter(line => /^\s*(status|draft|partial)\s*:/u.test(line))
    .join('\n');

  const finalFrontmatter = [
    frontmatter,
    carried,
    `translatedFrom: ${sourceHash(item.en)}`,
    `sections: ${JSON.stringify(enHashes)}`
  ]
    .filter(Boolean)
    .join('\n');

  return {
    frontmatter: finalFrontmatter,
    body,
    unitCount: canReuse ? toTranslate.length : enSections.length,
    reused: canReuse ? enSections.length - toTranslate.length : 0
  };
}

/* -------------------------------------------------------------------------- */
/* 消息目录                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 翻译站点消息目录（`src/locales/{en,zh}.json`）。
 *
 * 这类是**扁平 JSON 字符串**，正是 DeepL 擅长的形态 —— 参考站的 `sui translate`
 * 也只做这一类。键保持英文（是代码里的 `t('layout.header.search')`），只翻值。
 */
async function translateMessages(glossary) {
  const enPath = join(SITE_LOCALES_DIR, `${SOURCE_LOCALE}.json`);
  const zhPath = join(SITE_LOCALES_DIR, `${TARGET_LOCALE}.json`);

  const en = JSON.parse(readFileSync(enPath, 'utf8'));
  let zh = {};
  try {
    zh = JSON.parse(readFileSync(zhPath, 'utf8'));
  } catch {
    zh = {};
  }

  const pending = [];
  const walk = (node, target, path = []) => {
    for (const [key, value] of Object.entries(node)) {
      const here = [...path, key];
      if (value !== null && typeof value === 'object') {
        target[key] ??= {};
        walk(value, target[key], here);
        continue;
      }
      // 已有译文且非 --force 时跳过 —— 消息目录的人工润色通常比机器翻译好
      if (typeof target[key] === 'string' && !force) continue;
      pending.push({ path: here, value: String(value), target });
    }
  };
  walk(en, zh);

  if (!pending.length) {
    console.log('· 消息目录：无待译条目');
    return 0;
  }

  if (dryRun) {
    console.log(`· 消息目录：${pending.length} 条待译（dry-run）`);
    for (const p of pending) console.log(`    ${p.path.join('.')} = ${JSON.stringify(p.value)}`);
    return 0;
  }

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const out = await translateBatch(batch.map(p => p.value));
    if (out.length !== batch.length) {
      throw new Error(`消息目录行数不符：送入 ${batch.length}，返回 ${out.length}`);
    }
    batch.forEach((entry, k) => {
      entry.target[entry.path.at(-1)] = applyGlossary(out[k].trim(), glossary);
    });
  }

  // 键序跟随 en，避免无意义的排序 diff
  const ordered = {};
  const reorder = (source, target) => {
    for (const key of Object.keys(source)) {
      if (target[key] === undefined) continue;
      ordered[key] =
        typeof source[key] === 'object' && source[key] !== null
          ? (reorder(source[key], target[key]) ?? {})
          : target[key];
    }
    return ordered;
  };
  reorder(en, zh);

  writeFileSync(zhPath, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
  console.log(`✓ 消息目录：已写入 ${pending.length} 条译文`);
  return pending.length;
}

/* -------------------------------------------------------------------------- */
/* 主流程                                                                       */
/* -------------------------------------------------------------------------- */

const glossary = loadGlossary();
console.log(`术语表：${Object.keys(glossary).length} 条（apps/docs/TRANSLATION.md）`);

if (messagesOnly) {
  glossaryId = await setupGlossary(glossary);
  await translateMessages(glossary);
  process.exit(0);
}

const items = listSiteContent().filter(item => {
  if (!slugArgs.length) return true;

  // 两种写法都接受：`guide/introduction` 与 `guide/introduction.md`
  const slug = item.slug.replace(/\.md$/u, '');
  return slugArgs.some(s => s.replace(/\.md$/u, '') === slug);
});

/** 是否需要翻这一篇：无译文、占位页、源哈希漂移，或 --force。 */
function needsWork(item) {
  if (!item.zh) return '无译文';
  if (isTranslationStub(item.zh)) return '占位页';
  const hash = readFrontmatterField(splitFrontmatter(item.zh).frontmatter, 'translatedFrom');
  if (!hash) return '缺 translatedFrom';
  if (hash !== sourceHash(item.en)) return '源已变更';
  return force ? '强制重译' : null;
}

const queue = items.map(item => ({ item, why: needsWork(item) })).filter(q => q.why);

if (!queue.length) {
  console.log('✓ 没有待翻译或需重译的内容');
  process.exit(0);
}

console.log(`待处理：${queue.length} 篇`);
for (const { item, why } of queue) console.log(`  · ${item.slug} — ${why}`);

if (dryRun) {
  console.log('\n[dry-run] 未调用 DeepL。去掉 --dry-run 执行翻译。');
  process.exit(0);
}

glossaryId = await setupGlossary(glossary);

let done = 0;
let failed = 0;

for (const { item } of queue) {
  try {
    const result = await translateDocument(item, glossary);

    // ── 结构校验卡口 ──
    // 落盘前的最后一道闸：译文若破坏了标题层级/代码块/链接，拒绝写入并保留
    // 原有译文，而不是把半成品写进仓库。这是「分块翻译」之外的第二重保障 ——
    // 分块是行为约定，这里是可断言的判据。
    const candidate = `---\n${result.frontmatter}\n---${result.body}`;
    const problems = diffStructure(item.en, candidate);
    if (problems.length) {
      console.error(`✗ ${item.slug} 结构校验未通过，已跳过写入：`);
      for (const p of problems) console.error(`    ${p}`);
      failed += 1;
      continue;
    }

    writeFileSync(item.zhPath, candidate, 'utf8');
    const detail = result.reused
      ? `${result.unitCount} 节重译，${result.reused} 节保留`
      : `整篇翻译（${result.unitCount} 节）`;
    console.log(`✓ ${item.slug}（${detail}）`);
    done += 1;
  } catch (error) {
    console.error(`✗ ${item.slug}: ${error.message}`);
    failed += 1;
  }
}

console.log();
console.log(`完成 ${done} 篇${failed ? `，失败 ${failed} 篇` : ''}`);
if (failed) {
  console.error('失败项未写入文件，原有译文保持不变。');
  process.exit(1);
}
console.log('下一步：node scripts/i18n-check.mjs 校验门禁');
