/**
 * 文档国际化共享原语（内容正文的漂移检测与翻译）。
 *
 * 被 `i18n-check.mjs`（门禁）与 `i18n-translate.mjs`（DeepL 翻译）共用，所以
 * 「什么算漂移」与「翻译哪几行」必须来自同一处实现 —— 否则门禁会拒绝翻译器
 * 刚写出的产物，或者放过翻译器跳过的内容。
 *
 * 事实源是 `en/`；`zh/` 是它的镜像。
 *
 * 适用范围（见 ADR-0009 与 apps/docs/TRANSLATION.md）：**仅用户向内容**
 * （站点正文 + 站点消息目录）。`docs/`（维护者文档）、`skills/`（喂给 AI 的
 * 提示词）、`package.json` description（npm 元数据）、`CHANGELOG.md`（生成物）
 * 刻意不翻译 —— 详见 NOT_TRANSLATED。
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

/** 站点内容目录（`apps/docs/src/content/{en,zh}`）。 */
export const SITE_CONTENT_DIR = join(root, 'apps/docs/src/content');

/** 站点消息目录（`apps/docs/src/locales/{en,zh}.json`）。 */
export const SITE_LOCALES_DIR = join(root, 'apps/docs/src/locales');

/** 源语言与目标语言。 */
export const SOURCE_LOCALE = 'en';
export const TARGET_LOCALE = 'zh';

/**
 * 刻意不翻译的文档面 —— 这份清单是流程的一部分，不是注释。
 *
 * 没有它，每次有人问「README / ADR / skills 怎么没译」都要重新论证一遍。
 * 理由逐条写在 `apps/docs/TRANSLATION.md` 与 ADR-0009。
 */
export const NOT_TRANSLATED = [
  { path: 'docs/**', why: '维护者向工程文档（ADR / glossary / roadmap），docs/README.md 自述边界' },
  { path: 'skills/**', why: '喂给 AI agent 的提示词，语言一致比本地化重要' },
  { path: 'packages/*/package.json#description', why: 'npm 元数据，英文是生态惯例' },
  { path: 'CHANGELOG.md', why: '`soy release` 从 commit 派生，重生成会覆盖译文' }
];

/* -------------------------------------------------------------------------- */
/* frontmatter                                                                 */
/* -------------------------------------------------------------------------- */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/u;

/** 拆出 frontmatter 原文与正文；无 frontmatter 时前者为 null。 */
export function splitFrontmatter(source) {
  const match = source.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: null, body: source };
  return { frontmatter: match[1], body: source.slice(match[0].length) };
}

/** 读一个 frontmatter 标量字段（`key: value`），不存在返回 undefined。 */
export function readFrontmatterField(frontmatter, key) {
  if (!frontmatter) return undefined;
  const match = frontmatter.match(new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, 'mu'));
  if (!match) return undefined;
  return match[1].trim().replace(/^['"]|['"]$/gu, '');
}

/**
 * 该内容是否为「已标记未翻译的占位页」。
 *
 * `status: translated-stub` 是渲染层信号（`doc-md.vue` 的 `isTranslationStub()`）：
 * 带着它的页面会被当作**内容缺失**，显示英文正文 + 提示条。所以它既是翻译的
 * 待办标记，也是「这篇不算完成」的判据。
 */
export function isTranslationStub(source) {
  return /^\s*status:\s*translated-stub\s*$/mu.test(splitFrontmatter(source).frontmatter ?? '');
}

/* -------------------------------------------------------------------------- */
/* 源哈希                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 源正文的指纹 —— 漂移检测的判据。
 *
 * 只哈希**正文**（不含 frontmatter）：译文自己的 frontmatter 必然不同
 * （title/description 已译、多一个 translatedFrom），把它算进去会让每篇都
 * 永远「漂移」。
 *
 * 哈希前做一次归一化：行尾统一 LF、折叠行尾空白。否则在 Windows 上 checkout
 * 或编辑器加一个尾随空格，就会把全站标记为 stale。
 */
export function sourceHash(enSource) {
  const { body } = splitFrontmatter(enSource);
  const normalized = body
    .replace(/\r\n/gu, '\n')
    .split('\n')
    .map(line => line.replace(/\s+$/u, ''))
    .join('\n')
    .trim();

  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 12);
}

/* -------------------------------------------------------------------------- */
/* 遍历                                                                         */
/* -------------------------------------------------------------------------- */

/** 递归收集目录下的 `.md` 相对路径（posix 分隔符，已排序）。 */
export function collectMarkdown(dir) {
  const out = [];

  const walk = current => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.endsWith('.md')) out.push(relative(dir, full).split('\\').join('/'));
    }
  };

  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  walk(dir);
  return out;
}

/** 站点内容：`{ slug, enPath, zhPath, en, zh }[]`（按 en 侧文件集为准）。 */
export function listSiteContent() {
  const enDir = join(SITE_CONTENT_DIR, SOURCE_LOCALE);
  const zhDir = join(SITE_CONTENT_DIR, TARGET_LOCALE);

  return collectMarkdown(enDir).map(slug => {
    const enPath = join(enDir, slug);
    const zhPath = join(zhDir, slug);
    const zhExists = statSync(zhPath, { throwIfNoEntry: false })?.isFile() ?? false;

    return {
      slug,
      enPath,
      zhPath,
      en: readFileSync(enPath, 'utf8'),
      zh: zhExists ? readFileSync(zhPath, 'utf8') : null
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 结构指纹（译文保真度校验）                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 结构指纹 —— 判定「译文有没有破坏 markdown 结构」。
 *
 * DeepL 直接翻整篇 markdown 会毁结构（实测：`title:` → `标题：` 让 frontmatter
 * 解析崩、`</Link>` 被吞、`'virtual'` → `&#x27;virtual&#x27;`）。分块翻译避开了
 * 这一点，但「避开」是行为约定，这份指纹把它变成可断言的判据：翻译器落盘前
 * 逐项比对，不符就拒绝写入。
 *
 * 比较的是**结构**而非文本，且刻意容忍译文必然带来的差异：
 *   - 标题层级序列 —— 只比层级深浅，不比文案；但不允许合并/拆分层级
 *   - 代码围栏数量与语言标注 —— 语言标注必须原样（`ts` 不能变 `TS`）
 *   - 表格行数
 *   - 站内链接的**条数**（不比 URL）—— 锚点由标题文本派生，标题译了锚点必然译
 *   - 行内代码**相对差**（见下）
 */
export function structureFingerprint(source) {
  const { body } = splitFrontmatter(source);
  const lines = body.split('\n');

  const headingLevels = [];
  const fenceLangs = [];
  const linkCount = [];
  let tableRows = 0;
  let inlineCode = 0;
  let inFence = false;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*```(\S*)/u);
    if (fenceMatch) {
      inFence = !inFence;
      if (inFence) fenceLangs.push(fenceMatch[1] || '');
      continue;
    }
    if (inFence) continue;

    const heading = line.match(/^(#{1,6})\s/u);
    if (heading) headingLevels.push(heading[1].length);

    if (/^\s*\|/u.test(line)) tableRows += 1;

    // 只记条数：`<Link to>` 的目标含锚点时，锚点是从标题文本派生的，
    // 标题一旦翻译锚点必然跟着变，比对 URL 会把每篇正常译文都报成结构不符。
    //
    // 大小写不敏感：实测 DeepL 偶发把 `</Link>` 输出成 `</LINK>`。组件名大小写
    // 敏感确实是 Vue 的语义，但那是**译文质量**问题，由 `normalizeComponentTags`
    // 在落盘前修掉；这里若按大小写报警，会把「已自动修好」的文件报成结构不符。
    linkCount.push((line.match(/<link\s+to="/giu) ?? []).length);

    inlineCode += (line.match(/`[^`\n]+`/gu) ?? []).length;
  }

  return { headingLevels, fenceLangs, tableRows, inlineCode, linkCount: linkCount.reduce((a, b) => a + b, 0) };
}

/** 比较两份结构指纹，返回差异说明（空数组表示结构一致）。 */
export function diffStructure(enSource, zhSource) {
  const a = structureFingerprint(enSource);
  const b = structureFingerprint(zhSource);
  const problems = [];

  const seq = (x, y, label, format = v => v) => {
    if (x.length !== y.length) {
      problems.push(`${label}数量不符：en ${x.length}，zh ${y.length}`);
      return;
    }
    const at = x.findIndex((v, i) => JSON.stringify(v) !== JSON.stringify(y[i]));
    if (at !== -1) {
      problems.push(`${label}第 ${at + 1} 项不符：en ${format(x[at])}，zh ${format(y[at])}`);
    }
  };

  seq(a.headingLevels, b.headingLevels, '标题层级', v => `h${v}`);
  seq(a.fenceLangs, b.fenceLangs, '代码块语言标注', v => `\`${v}\``);

  if (a.tableRows !== b.tableRows) problems.push(`表格行数不符：en ${a.tableRows}，zh ${b.tableRows}`);
  if (a.linkCount !== b.linkCount) problems.push(`站内链接条数不符：en ${a.linkCount}，zh ${b.linkCount}`);

  // 行内代码数量：译文合并句读会顺带增减 `` `x` ``，小幅波动是正常的。
  // 超过 10% 或 5 个才判为异常 —— 那才是「标识符被翻译/丢失」的信号。
  const drift = Math.abs(a.inlineCode - b.inlineCode);
  if (drift > Math.max(5, a.inlineCode * 0.1)) {
    problems.push(`行内代码数量差异过大：en ${a.inlineCode}，zh ${b.inlineCode}`);
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* 分节（增量翻译的基础）                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 按标题把正文切成分节。开头到首个标题之间的内容算「前言节」。
 *
 * 增量翻译的基础：漂移重译时只重做真正变了的节，其余原样保留。
 *
 * 为什么必须按节保留：实测整篇重译会把已经润色好的译文降级 —— 原本的
 * 「文件式路由」（术语表用词）被 DeepL 改成「基于文件的路由」，
 * 「可移植服务端运行时」被改成**语义错误**的「可移植服务端 / 客户端运行时」。
 * 站点译文质量高于机器翻译时，全篇重译是净损失。
 *
 * 围栏内的 `#` 注释不算标题。
 */
export function splitSections(body) {
  const sections = [];
  let current = [];
  let currentHeading = null;
  let inFence = false;

  const flush = () => {
    if (current.length) sections.push({ heading: currentHeading, text: current.join('\n') });
  };

  for (const line of body.split('\n')) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;

    if (!inFence && /^#{1,6}\s/u.test(line) && current.length) {
      flush();
      current = [];
      currentHeading = line.trim();
    } else if (!inFence && /^#{1,6}\s/u.test(line)) {
      currentHeading = line.trim();
    }

    current.push(line);
  }

  flush();
  return sections;
}

/** 单节指纹（已归一化，与 `sourceHash` 同规则）。 */
export function sectionHash(text) {
  const normalized = text
    .replace(/\r\n/gu, '\n')
    .split('\n')
    .map(line => line.replace(/\s+$/u, ''))
    .join('\n')
    .trim();

  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 8);
}

/**
 * 分节指纹串，落进 frontmatter 的 `sections`。
 *
 * 第 0 项是 frontmatter 的 `title` + `description`（键名与值一起哈希），
 * 之后依次是正文各节。把两者放在同一个数组里，是为了让「保留还是重译」
 * 的判断只有一条位置对齐规则，不必再维护第二套元数据。
 *
 * 存在内容文件里而不是旁挂状态文件：它随文件走，不可能与内容失同步。
 */
export function sectionHashes(enSource) {
  const { frontmatter, body } = splitFrontmatter(enSource);
  const meta = (frontmatter ?? '')
    .split('\n')
    .filter(line => /^\s*(title|description)\s*:/u.test(line))
    .join('\n');

  return [sectionHash(meta), ...splitSections(body).map(section => sectionHash(section.text))];
}

/* -------------------------------------------------------------------------- */
/* 术语表                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 解析 `apps/docs/TRANSLATION.md` 的术语表 → `{ 英文小写: 中文 }`。
 *
 * 术语表是翻译质量的前置件：上一轮 17 篇译文靠它把 `islands/群岛`、`loader/加载器`
 * 的混用（24 次 vs 3 次）收敛掉。DeepL 内置词表不会认这些框架专有术语，所以
 * 它翻完必须过一遍术语校正 —— 这份表就是那一步的依据，也是 DeepL Glossary 的
 * 素材来源，两处共用避免漂移。
 *
 * 收两张表：
 *   - 「译中文（固定译法）」—— 英文列可能有多个用 `/` 分隔的同义词
 *   - 「双写法」—— 中文列是「首次全称（英文）」，取其中的中文部分
 *
 * 值会被清洗：去掉 `**` 强调、截到第一个 `；` 或 `，`（那里通常是解释而非译法）。
 */
export function loadGlossary(markdownPath = join(root, 'apps/docs/TRANSLATION.md')) {
  const source = readFileSync(markdownPath, 'utf8');
  const glossary = {};

  const clean = value =>
    value
      .replace(/\*\*/gu, '')
      .split(/[；;，,]/u)[0]
      .replace(/`/gu, '')
      // `数据加载器（loader）` → `数据加载器`：括注是给读者看的双写法提示，
      // 拿来当术语校正的目标值会把括注一起写进正文。
      .replace(/（[^）]*）|\([^)]*\)/gu, '')
      .trim();

  const add = (term, value) => {
    const key = term.trim().toLowerCase();
    const val = clean(value);
    // 只收「纯英文术语 → 含中文的译法」。英文列里混着的说明性条目
    // （如 `Vite` `Vue` 这类保留英文的词）没有中文值，自然被排除。
    if (!/^[a-z][a-z\s-]*$/u.test(key)) return;
    if (!/[\u4e00-\u9fff]/u.test(val)) return;
    if (!glossary[key]) glossary[key] = val;
  };

  const rowsOf = heading => {
    const section = source.split(heading)[1];
    if (!section) return [];
    const body = section.split(/\n###\s/u)[0];
    return body.match(/^\|.*\|$/gmu) ?? [];
  };

  // 「译中文」：英文 | 中文 | 备注
  for (const row of rowsOf('### 译中文')) {
    const cells = row
      .split('|')
      .map(c => c.trim())
      .filter(Boolean);
    if (cells.length < 2 || /^-+$/u.test(cells[0]) || cells[0] === '英文') continue;
    for (const term of cells[0].split('/').map(t => t.trim())) add(term, cells[1]);
  }

  // 「双写法」：首次 | 之后 —— 中文列形如 `数据加载器（loader）`，取中文部分，
  // 「之后」列（`loader`）作为该英文键的译法，保证正文里的裸 `loader` 也能校正。
  for (const row of rowsOf('### 双写法')) {
    const cells = row
      .split('|')
      .map(c => c.trim())
      .filter(Boolean);
    if (cells.length < 2 || /^-+$/u.test(cells[0]) || cells[0] === '首次') continue;
    const zhFull = clean(cells[0]);
    const latin = cells[1].match(/^[A-Za-z][A-Za-z\s-]*$/u)?.[0];
    if (latin && /[\u4e00-\u9fff]/u.test(zhFull)) add(latin, zhFull);
  }

  return glossary;
}
