/**
 * markdown 正文分块 —— DeepL 翻译的安全边界。
 *
 * **为什么必须分块**：DeepL 直接翻整篇 markdown 会毁结构。实测三种方案：
 *
 *   1. 整篇直送     → `title:` → `标题：`（frontmatter 解析崩）、`</Link>` 被吞、
 *                     `'virtual'` → `&#x27;virtual&#x27;`
 *   2. `\u0001` 哨兵 → DeepL 把控制字符转成 `elil`，占位全废
 *   3. `<x id="n"/>` → DeepL 在标签周围**注入换行**，把表格切碎
 *
 * 参考站（soybean-ui）的 DeepL 只处理扁平 JSON，从不碰它的 111 篇中文正文 ——
 * 那些是 LLM 写的。所以这里不照搬它的做法，而是把 markdown 拆成
 * 「可翻译的正文行」与「必须原样保留的结构行」，只把前者送去翻译，再按原
 * 位置回填。
 *
 * 翻译单元是**行**：整行送入、整行取回，行数必须一致。段落内的软换行会带来
 * 一点局限（一个段落被拆成多行时会逐行翻译，损失句间上下文），但 markdown
 * 里段落通常就是一行，实测这个取舍换来了结构的完全保真。
 */

/** 该行是否必须原样保留（结构行）。 */
function isStructural(line, state) {
  // 代码围栏本身，以及围栏内的一切
  if (/^\s*```/u.test(line)) return true;
  if (state.inFence) return true;

  // 表格行（含分隔行）：单元格里的文字会单独翻译，行结构不动
  if (/^\s*\|/u.test(line)) return true;

  // 标题：`#` 标记与层级保留，标题文字可译 —— 交给 prose 处理
  // 列表项：`-` / `*` / `1.` 标记保留，文字可译 —— 交给 prose 处理
  // 引用：`>` 标记保留，文字可译 —— 交给 prose 处理

  // 空行：不透传（避免 DeepL 吞掉或增行，回填时按原空行还原）
  if (!line.trim()) return true;

  return false;
}

/** 行首的 markdown 标记前缀（标题/列表/引用），翻译时剥掉、回填时还原。 */
function splitPrefix(line) {
  const match = line.match(/^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)?)(.*)$/u);
  return { prefix: match[1], text: match[2] };
}

/**
 * 把 markdown 拆成可翻译行。
 *
 * 返回 `{ lines, units }`：
 *   - `lines` 是原始行数组（回填时的骨架）
 *   - `units` 是 `{ index, prefix, text }[]`，只含需要翻译的行
 *
 * 表格单元格不单独送翻译（那样会破坏列对齐），整行走 prose 分支的例外：
 * 表格行直接跳过，因为逐格翻译需要重建表格，代价高于收益 —— 现有译文里
 * 表格内容由人工/LLM 处理。
 */
export function splitTranslatable(markdown) {
  const lines = markdown.split('\n');
  const units = [];
  const state = { inFence: false };

  // frontmatter 必须整体跳过。把它送进 DeepL 会得到 `标题：Islands` —— 冒号变
  // 全角、键被翻译，frontmatter 解析直接崩溃。title/description 的翻译由调用方
  // 单独按字段处理。
  let frontmatterEnd = -1;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
    frontmatterEnd = close;
  }

  lines.forEach((line, index) => {
    if (index <= frontmatterEnd) return;

    const structural = isStructural(line, state);

    if (/^\s*```/u.test(line)) state.inFence = !state.inFence;

    if (structural) return;

    const { prefix, text } = splitPrefix(line);
    if (!text.trim()) return;

    units.push({ index, prefix, text });
  });

  return { lines, units, frontmatterEnd };
}

/**
 * 把译文按原行号回填进骨架。
 *
 * 行数不符时**拒绝回填**并报错：那意味着 DeepL 增删了行，硬填会把文件写坏。
 * 调用方据此跳过该文件而不是写入半成品。
 */
export function mergeTranslatable(lines, units, translated) {
  if (translated.length !== units.length) {
    throw new Error(`译文行数不符：送入 ${units.length} 行，返回 ${translated.length} 行`);
  }

  const out = [...lines];

  units.forEach((unit, i) => {
    out[unit.index] = unit.prefix + translated[i].trim();
  });

  return out.join('\n');
}

/* -------------------------------------------------------------------------- */
/* 组件标签规范化                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 修正被翻译引擎改坏大小写的组件标签。
 *
 * 实测 DeepL 会把同一批里的个别 `<Link>` 输出成 `<LINK>`（三行里坏一行）。
 * Vue 组件名大小写敏感，`<LINK>` 不会被解析成 `Link` 组件，页面会渲染成一个
 * 未知元素 —— 静默失效，构建不报错。所以落盘前统一修回。
 *
 * 只处理已知的框架内置组件（它们是全局注册的 PascalCase 名），不碰普通 HTML
 * 标签与用户组件 —— 后者的大小写在用户手里，猜错会改坏代码。
 */
const KNOWN_COMPONENTS = ['Link', 'Head', 'PageView', 'SlotView', 'ClientOnly', 'CopyButton'];

export function normalizeComponentTags(text) {
  let result = text;

  for (const name of KNOWN_COMPONENTS) {
    // 开/闭标签都修，容忍属性与自闭合
    result = result.replace(new RegExp(`<(/?)${name}(?=[\\s/>])`, 'giu'), (_, slash) => `<${slash}${name}`);
    // 自闭合的 `</LINK>` 形态（引擎误加的闭标签）也归一
    result = result.replace(new RegExp(`</${name}\\s*>`, 'giu'), `</${name}>`);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* 术语校正                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 用术语表校正译文。
 *
 * DeepL 不认框架专有术语：实测把 `hydration` 译成「加载」而非术语表的「水合」，
 * `islands` 译成「孤岛」而非「群岛」。DeepL 的 Glossary API 虽支持 EN→ZH，但需要
 * 额外开通与上传维护；在文本上做一次校正更直接，且与 `TRANSLATION.md` 同源。
 *
 * 只在**正文文本**里替换，且跳过行内代码 —— 否则会把 `` `island` `` 这类
 * 标识符也改掉。
 */
export function applyGlossary(text, glossary) {
  let result = text;
  const placeholders = [];

  // 先摘出行内代码，避免在其中做术语替换。
  //
  // 用一个不可能出现在正文里的哨兵包住占位符。选 `\uE000` 私用区字符而非
  // `\u0000`：后者是控制字符，会被 lint 规则拦下，且部分库会把它当字符串终止符。
  const SENTINEL = '\uE000';
  result = result.replace(/`[^`\n]+`/gu, match => {
    placeholders.push(match);
    return `${SENTINEL}${placeholders.length - 1}${SENTINEL}`;
  });

  for (const [term, translation] of Object.entries(glossary)) {
    // 只处理多字母术语，跳过 `ppr`/`ssr` 这类缩写（在中文句子里本就保留英文）
    if (term.length < 4 || /^(ssr|ssg|spa|csr|isr|ppr|api|css|html|dom|ttl|swr)$/u.test(term)) continue;

    // 词边界：英文术语在中文里通常被空格或标点包围
    const pattern = new RegExp(`(?<![A-Za-z])${term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![A-Za-z])`, 'giu');

    // 只替换仍是英文的形态：术语已被译成中文时无从判断对错，不动它。
    result = result.replace(pattern, match => (/\p{Script=Han}/u.test(match) ? match : translation));
  }

  // 中文排版：中文与中文之间不保留空格。只在替换点两侧都是中文时收紧，
  // 中英之间与中文/标点之间的空格保留 —— 那是中文技术文档的通行排版。
  result = result.replace(/([\u4e00-\u9fff])[ \t]+([\u4e00-\u9fff])/gu, '$1$2');

  // 替换后可能出现同词叠用：`islands 架构` 里的 `islands` 被换掉后得到
  // `群岛架构架构`。术语表的译法常已含后缀（`群岛架构` = islands + 架构），
  // 而原文那里已经带着 `架构`。折叠紧邻的重复片段。
  result = result.replace(/([\u4e00-\u9fff]{2,})\1/gu, '$1');

  return result.replace(new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'gu'), (_, i) => placeholders[Number(i)]);
}
