/**
 * Azure Translator 驱动（默认引擎，优先于 DeepL）—— 文档 i18n 的请求层。
 *
 * 为什么在 DeepL 之外再做一个：DeepL 免费版按字符计费、术语表只允许 1 个；Azure
 * 订阅（`AZURE_TRANSLATE_KEY` / `AZURE_TRANSLATE_REGION`）配额更宽。两者共用同一套
 * 分块 / 术语校正 / 结构校验卡口，差别只在「怎么发请求、怎么护住不可译片段」。
 *
 * Azure 与 DeepL 的三个关键差异（均实测，非文档推测）：
 *
 *   1. **它是 HTML 感知的**。`textType=html` 下 `<a href>` / `<code>` / `<span>`
 *      连同属性原样保留，且 `<code>` 内容**不被翻译**（实测 `routeRules.prerender`
 *      稳定回传）。所以这里把行内代码、Vue 组件、站内链接目标都转成真标签再送，
 *      而不是像 DeepL 那样只能靠哨兵文本 —— 后者实测会被改坏：
 *      `` `definePage` `` → `'definePage'`、`[x](/url)` → `[x]（/url）`（括号变全角，
 *      链接失效）、`<Link to="/x">` → `<链接="/x">`（标签名被翻译）。
 *   2. **它有硬性单请求上限**。单请求 >50k 字符返回 `400077 The maximum request size
 *      has been exceeded.`；数组元素数也有上限。所以按**字符**切批，而不是按行数 ——
 *      表格行可达数百字符，固定行数在长表格上必撞上限。
 *   3. **它按源字符计流，不是按请求计次**。同一窗口内连发请求会撞 429001，而 429
 *      是**令牌桶拒绝，不是配额耗尽**（实测约 15s 后自行恢复）。所以本模块用字符预算
 *      闸门主动调速，退避重试只作为兜底，不作为主要手段。实测数据见
 *      `DEFAULT_AZURE_CHARS_PER_HOUR` 的注释。
 *
 * 占位符形态 `XQZX<n>XQZX`：实测 Azure 会改坏 `§0§`（序号被当数字重排）、`\uE000`
 * （整段被吞）、`<ph id="0"/>`（属性引号变全角）。纯大写字母包裹的数字串在 8 个
 * 候选里是唯一全程原样回传的形态，且不会与英文正文里的真实词冲突。
 */
import { applyGlossary, normalizeComponentTags } from './chunk.mjs';

/** Azure 自己的单请求传输上限：超过即 `400`。元素数上限同样来自它。 */
export const AZURE_MAX_CHARS_PER_REQUEST = 50_000;
export const AZURE_MAX_ITEMS_PER_REQUEST = 1_000;

/** 每个元素在 JSON body 里的固定开销（`{"text":""},` 之类）的保守估计。 */
const PER_ELEMENT_OVERHEAD = 16;

/**
 * Azure 对源字符做**滑动窗口**计量，而窗口的真实天花板远低于套餐表上写的数字。
 * 在 `southeastasia` 上对真实 `api` 负载实测：
 *
 *   - 429 是令牌桶拒绝、不是配额耗尽：突发后约 15s 自行恢复，进程从未真的用完月度额度；
 *   - 突发额度约 30 000 字符 —— 10 000 × 4 的连续突发在第 4 个请求被拒，约 70 000
 *     字符会把窗口堵住约 30s；
 *   - 约 555 字符/秒可持续（500/s 连跑 60s 干净，1 000/s 与 2 000/s 都在约 35s 后开始
 *     失败），即约 2 000 000 字符/小时。
 *
 * 所以默认值只花掉可持续天花板的 75%，并让每个请求都落在突发额度内 —— 闸门因此
 * 基本不会走到「被拒 → 重试」这条路径。换套餐时用 `AZURE_CHARACTERS_PER_HOUR`
 * （或 `AZURE_CHARACTERS_PER_MINUTE`）覆盖预算，用 `AZURE_CHARACTERS_PER_REQUEST`
 * 覆盖单请求粒度。
 */
export const DEFAULT_AZURE_CHARS_PER_HOUR = 1_500_000;
export const AZURE_DEFAULT_CHARS_PER_REQUEST = 10_000;

/** 兜底重试次数。闸门正常工作时不该用到它；429/5xx 各给几次机会即可。 */
const MAX_ATTEMPTS = 3;

const TOKEN_PATTERN = /XQZX(\d+)XQZX/gu;

const token = index => `XQZX${index}XQZX`;

/**
 * 摘出「不可译片段」并换成占位符，其余文本留待翻译。
 *
 * 顺序敏感，所以用**单个**正则一次扫完，而不是分步替换 —— 分步会让上一步的替换
 * 结果被下一步的规则再次匹配。
 *
 * 四个分支（匹配到的原文**逐字**存进 `spans`，回填时原样写回）：
 *   1. 行内代码 `` `x` `` —— 必须回填反引号本身，不能回填 `<code>x</code>`：
 *      markdown 里两者渲染结果相同，但结构指纹统计的是反引号，回填 HTML 会让
 *      行内代码数量在 zh 侧归零而被卡口拦下（把好译文报成结构破坏）。
 *   2. markdown 链接/图片的 URL 部分 `](/x)` —— 实测裸送会被改成 `（/x）`，
 *      全角括号，链接直接失效。
 *   3. Vue 组件标签 `<Link to="/x">` —— 实测裸送会把标签名也翻译掉：
 *      `<Link to="/guide/routing">` → `<链接="/guide/routing">`。
 *   4. 裸 HTML 标签 `<a href>` / `</p>` —— 同上。
 */
const SPAN_PATTERN = new RegExp(
  [
    '`[^`\\n]+`', // 1 行内代码
    '\\]\\([^)\\s]+(?:\\s+"[^"]*")?\\)', // 2 markdown 链接目标
    '</?[A-Z][A-Za-z0-9]*(?:\\s[^<>]*)?/?>', // 3 Vue 组件标签
    '</?[a-z][a-z0-9]*(?:\\s[^<>]*)?/?>' // 4 裸 HTML 标签
  ].join('|'),
  'gu'
);

/**
 * 转义会成为 HTML 结构的字符，避免 Azure 把 `A & B` 当实体、把 `a < b` 当标签。
 *
 * 不动 `>`：它在标签之外无歧义，转义反而会让正文里出现 `&gt;`。
 * 幂等：已存在的实体与已存在的标签不再二次转义。
 */
function encodeEntities(text) {
  return text
    .replace(/&(?!#\d+;|#x[0-9a-f]+;|[a-z][a-z0-9]*;)/giu, '&amp;')
    .replace(/<(?!\/?[a-z][a-z0-9]*(?:\s[^>]*)?>)/giu, '&lt;');
}

/** 还原 `encodeEntities` 的转义。`&amp;` 必须最后，否则 `&amp;lt;` 会被二次解码。 */
function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&');
}

/**
 * 把一行 markdown 拆成「送翻译的 HTML 文本」+「待回填的片段表」。
 *
 * 导出是为了可测：回填（`decodeLine`）是这一步的逆运算，两者错位会让译文里出现
 * 裸 `XQZX0XQZX` 或丢掉组件标签，而结构校验卡口**不会**报这类错（标签被占位符
 * 替换后，链接条数在 en 与 zh 上都算 0，两边一致）。
 */
export function encodeLine(text) {
  const spans = [];
  const withTokens = text.replace(SPAN_PATTERN, match => {
    spans.push(match);
    return token(spans.length - 1);
  });

  return { text: encodeEntities(withTokens), spans };
}

/** `encodeLine` 的逆运算：实体还原只作用于骨架，占位符回填时不再解码。 */
export function decodeLine(text, spans) {
  return decodeEntities(text).replace(TOKEN_PATTERN, (whole, index) => spans[Number(index)] ?? whole);
}

/** 译文里残留的占位符（未回填/被 Azure 改写）—— 出现即视为该行失败。 */
export function pendingTokens(text) {
  return [...text.matchAll(TOKEN_PATTERN)].map(match => match[0]);
}

/**
 * 区域型 locale 的映射表。
 *
 * Azure 只发布「分叉语言」的地区变体（`pt-BR`/`pt-PT`、`zh-Hans`/`zh-Hant`、
 * `sr-Cyrl`…）；`en-GB` / `de-AT` 这类没有独立模型的地区变体必须塌回基础语言，
 * 否则请求报语言码不支持。繁简用脚本子标签表达，不是地区。
 */
const AZURE_LANGUAGE_ALIASES = new Map([
  ['zh', 'zh-Hans'],
  ['zh-cn', 'zh-Hans'],
  ['zh-sg', 'zh-Hans'],
  ['zh-hans', 'zh-Hans'],
  ['zh-tw', 'zh-Hant'],
  ['zh-hk', 'zh-Hant'],
  ['zh-mo', 'zh-Hant'],
  ['zh-hant', 'zh-Hant'],
  ['pt-br', 'pt'],
  ['pt-pt', 'pt'],
  ['nb-no', 'nb'],
  ['sr-latn', 'sr-Latn']
]);

const AZURE_REGIONAL_LANGUAGES = new Set(['pt', 'zh', 'sr']);

function formatAzureSubtag(subtag) {
  // 4 字母子标签是 ISO 15924 脚本（`zh-Hans`、`sr-Cyrl`），不是地区。
  return subtag.length === 4 ? `${subtag[0]?.toUpperCase()}${subtag.slice(1).toLowerCase()}` : subtag.toUpperCase();
}

/**
 * DeepL 风格语言码（`EN` / `ZH` / `ZH-TW`）→ Azure 语言码（`en` / `zh-Hans`）。
 *
 * 放在驱动里而不是调用方：调用方只表达「源语言 / 目标语言」这一层意图，语言码是
 * 引擎的实现细节。写错的表现是请求被拒，而 DeepL 与 Azure 的码不同源。
 */
export function toAzureLanguage(locale) {
  const normalized = String(locale).trim().replace(/_/gu, '-').toLowerCase();
  const mapped = AZURE_LANGUAGE_ALIASES.get(normalized);

  if (mapped) return mapped;

  const [language, subtag] = normalized.split('-');

  if (!subtag) return language;

  if (subtag.length === 4) return `${language}-${formatAzureSubtag(subtag)}`;

  return AZURE_REGIONAL_LANGUAGES.has(language) ? `${language}-${subtag.toUpperCase()}` : language;
}

/**
 * 按字符数（并叠加元素数）切批。
 *
 * 为什么不能只按行数：单篇文档的行长度差异极大（表格行可达数百字符），24 行一批
 * 在长表格上会撞 400077 上限。按字符切是唯一与上限同源的判据。
 *
 * 默认粒度是**被调度的请求大小**而不是传输硬上限：闸门按请求粒度记账，粒度越小
 * 等待越平滑（见 `createCharacterBudgetGate`）。
 */
export function batchByChars(
  texts,
  maxChars = AZURE_DEFAULT_CHARS_PER_REQUEST,
  maxItems = AZURE_MAX_ITEMS_PER_REQUEST
) {
  const batches = [];
  let current = [];
  let size = 0;

  for (const text of texts) {
    const cost = text.length + PER_ELEMENT_OVERHEAD;
    const overflow = current.length && (size + cost > maxChars || current.length >= maxItems);

    if (overflow) {
      batches.push(current);
      current = [];
      size = 0;
    }

    current.push(text);
    size += cost;
  }

  if (current.length) batches.push(current);
  return batches;
}

/**
 * 本次运行的字符预算。环境变量让换套餐/测试可以按不同窗口调速，否则用实测默认值。
 */
function resolveCharsPerHour() {
  const perHour = Number.parseFloat(process.env.AZURE_CHARACTERS_PER_HOUR ?? '');
  if (perHour > 0) return perHour;

  const perMinute = Number.parseFloat(process.env.AZURE_CHARACTERS_PER_MINUTE ?? '');
  if (perMinute > 0) return perMinute * 60;

  return DEFAULT_AZURE_CHARS_PER_HOUR;
}

function resolveCharsPerRequest() {
  const requested = Number.parseFloat(process.env.AZURE_CHARACTERS_PER_REQUEST ?? '');
  const charsPerRequest = requested > 0 ? requested : AZURE_DEFAULT_CHARS_PER_REQUEST;

  return Math.min(charsPerRequest, AZURE_MAX_CHARS_PER_REQUEST);
}

/**
 * 字符预算闸门。
 *
 * 为什么是「记账」而不是「固定间隔」：Azure 计的是**滑动窗口**，不是请求频率，
 * 所以均匀的固定间隔在某一批比上一批更大时照样会超出。闸门记的是「本进程还欠
 * 窗口多少字符」，容量取一个请求的量 —— 流量因此平滑而不是突发。
 *
 * **必须在一次运行里只创建一次**并传给所有请求：按批创建等于每批都拿到一份满额
 * 预算，会立刻冲进 429（这正是「改成闸门」第一次没生效的原因）。
 *
 * 预算在**发请求之前**扣减，所以被拒的那次尝试也照样记账，它的重试必须像其他
 * 批次一样排队等待。
 */
export function createCharacterBudgetGate(charsPerHour, capacity) {
  const refillPerMs = charsPerHour / 3_600_000;
  let available = capacity;
  let lastRefillAt = Date.now();

  const refill = () => {
    const now = Date.now();
    available = Math.min(capacity, available + (now - lastRefillAt) * refillPerMs);
    lastRefillAt = now;
  };

  return async characters => {
    refill();

    const deficit = characters - available;

    if (deficit > 0) {
      const waitMs = Math.ceil(deficit / refillPerMs);
      console.log(`  ⏳ Azure 字符预算不足，等待 ${Math.ceil(waitMs / 1000)}s 后发下一批（预算 ${charsPerHour}/小时）`);
      await sleep(waitMs);
      refill();
    }

    available -= characters;
  };
}

/** `Retry-After` 的两种合法形态（秒数 / HTTP 日期）；缺失或不可解析时返回 null。 */
export function readRetryAfterMs(response) {
  const header = response.headers?.get?.('retry-after')?.trim();

  if (!header) return null;

  const seconds = Number(header);

  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const date = Date.parse(header);

  return Number.isNaN(date) ? null : Math.max(date - Date.now(), 0);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Azure Translator 驱动。
 *
 * 语言码归一由本模块负责（`toAzureLanguage`），调用方只表达「源/目标语言」。
 */
export function createAzureTranslator({ sourceLang = 'en', targetLang = 'zh-Hans' } = {}) {
  const endpoint = (
    process.env.AZURE_TEXT_TRANSLATE_URL?.trim() || 'https://api.cognitive.microsofttranslator.com/'
  ).replace(/\/?$/u, '/');
  const apiKey = () => process.env.AZURE_TRANSLATE_KEY?.trim() || '';
  const region = () => process.env.AZURE_TRANSLATE_REGION?.trim() || '';
  const source = toAzureLanguage(sourceLang);
  const target = toAzureLanguage(targetLang);

  if (!apiKey()) throw new Error('缺少 AZURE_TRANSLATE_KEY 环境变量（见 docs/i18n.md）');

  // 一次运行共用同一个闸门：Azure 计的是这个进程整体的窗口，不是单个请求。
  const awaitCharacterBudget = createCharacterBudgetGate(resolveCharsPerHour(), resolveCharsPerRequest());

  async function requestOnce(texts) {
    const url = `${endpoint}translate?api-version=3.0&from=${source}&to=${target}&textType=html`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey(),
        ...(region() ? { 'Ocp-Apim-Subscription-Region': region() } : {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(texts.map(text => ({ text })))
    });

    const raw = await response.text();

    // 空响应与 HTML 错误页都会让 `response.json()` 抛出 "Unexpected end of JSON input"，
    // 把真正的 HTTP 状态藏掉（鉴权失败 / 配额耗尽 / 端点写错都会走到这里）。
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(`Azure 返回非 JSON（HTTP ${response.status}）：${raw.slice(0, 200) || '(空响应)'}`);
    }

    if (!response.ok || payload?.error) {
      const error = new Error(
        `Azure HTTP ${response.status}（${payload?.error?.code ?? '未知'}）：${payload?.error?.message ?? raw.slice(0, 200)}`
      );
      // 429001 = 超频；5xx 是服务端瞬时故障。两者都是兜底路径 —— 闸门正常工作时不该出现。
      error.retryable = response.status === 429 || response.status >= 500;
      error.retryAfterMs = readRetryAfterMs(response);
      throw error;
    }

    if (!Array.isArray(payload)) throw new Error(`Azure 响应形态异常：${raw.slice(0, 200)}`);
    return payload.map(item => item?.translations?.[0]?.text);
  }

  /**
   * 发一批（含兜底重试），返回等长译文数组。
   *
   * 重试**不是**主要手段：`429` 是令牌桶拒绝，在没有调速的情况下重试只会不停撞上
   * 同一个关闭的窗口（实测退避到 16s 仍然失败）。这里只给瞬时故障留几次机会，并且
   * 优先听 `Retry-After` 而不是自己猜。
   */
  async function requestBatch(texts) {
    const characters = texts.reduce((sum, text) => sum + text.length + PER_ELEMENT_OVERHEAD, 0);

    for (let attempt = 1; ; attempt += 1) {
      // 扣费在请求前，所以被拒的尝试也占用额度，重试要排队。
      await awaitCharacterBudget(characters);

      try {
        const translated = await requestOnce(texts);
        if (translated.some(text => typeof text !== 'string')) {
          throw new Error('Azure 响应缺少 translations[0].text');
        }
        return translated;
      } catch (error) {
        if (!error.retryable || attempt >= MAX_ATTEMPTS) throw error;
        // 被限流时它通常直接告知窗口何时重开，照做比自己从猜测开始加倍更准。
        const wait = error.retryAfterMs ?? 2 ** (attempt - 1) * 1000;
        console.warn(
          `  ⚠ Azure 限流/瞬时故障，${Math.round(wait / 1000)}s 后重试（第 ${attempt}/${MAX_ATTEMPTS - 1} 次）：${error.message}`
        );
        await sleep(wait);
      }
    }
  }

  return {
    name: `Azure Translator（${source} → ${target}${region() ? `，${region()}` : ''}）`,

    /**
     * 翻译一批「已分块的可翻译行」。
     *
     * 行数守恒由本函数保证：Azure 的数组响应天然是逐元素对应的（实测 1000 元素
     * 也一一对应），不等长即抛错，由调用方跳过该文件而不是写入半成品。
     */
    async translateLines(texts) {
      const out = [];

      for (const batch of batchByChars(texts)) {
        const prepared = batch.map(encodeLine);
        const translated = await requestBatch(prepared.map(item => item.text));

        if (translated.length !== batch.length) {
          throw new Error(`Azure 行数不符：送入 ${batch.length}，返回 ${translated.length}`);
        }

        translated.forEach((line, index) => out.push(decodeLine(line, prepared[index].spans)));
      }

      return out;
    }
  };
}

/**
 * 术语校正 + 组件标签归一 —— 与 DeepL 路径共用同一份后处理。
 *
 * 术语表在 Azure 侧只能靠本地替换：Azure 的 `category` 参数只接受它内置的
 * 分类值（传自定义值返回 `400002 The category parameter is invalid.`），自定义
 * 术语表要走 Custom Translator，那需要单独的训练与部署流程。
 */
export function postProcess(line, glossary) {
  return applyGlossary(normalizeComponentTags(line), glossary);
}
