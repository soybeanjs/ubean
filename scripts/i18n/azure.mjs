/**
 * Azure Translator 驱动（默认引擎，优先于 DeepL）—— 文档 i18n 的请求层。
 *
 * 为什么在 DeepL 之外再做一个：DeepL 免费版按字符计费、术语表只允许 1 个；Azure
 * 订阅（`AZURE_TRANSLATE_KEY` / `AZURE_TRANSLATE_REGION`）配额更宽。两者共用同一套
 * 分块 / 术语校正 / 结构校验卡口，差别只在「怎么发请求、怎么护住不可译片段」。
 *
 * Azure 与 DeepL 的两个关键差异（均实测，非文档推测）：
 *
 *   1. **它是 HTML 感知的**。`textType=html` 下 `<a href>` / `<code>` / `<span>`
 *      连同属性原样保留，且 `<code>` 内容**不被翻译**（实测 `routeRules.prerender`
 *      稳定回传）。所以这里把行内代码、Vue 组件、站内链接目标都转成真标签再送，
 *      而不是像 DeepL 那样只能靠哨兵文本 —— 后者实测会被改坏：
 *      `\`definePage\`` → `'definePage'`、`[x](/url)` → `[x]（/url）`（括号变全角，
 *      链接失效）、`<Link to="/x">` → `<链接="/x">`（标签名被翻译）。
 *   2. **它有硬性请求上限**。单请求 >50k 字符返回 `400077 The maximum request size
 *      has been exceeded.`；突发超频返回 `429001 ... exceeded request limits.`。
 *      所以按字符切批，并对 429 做指数退避重试（实测持续压测后 429 会滞留约 1 分钟，
 *      退避上限取 16s 足够）。
 *
 * 占位符形态 `XQZX<n>XQZX`：实测 Azure 会改坏 `§0§`（序号被当数字重排）、`\uE000`
 * （整段被吞）、`<ph id="0"/>`（属性引号变全角）。纯大写字母包裹的数字串在 8 个
 * 候选里是唯一全程原样回传的形态，且不会与英文正文里的真实词冲突。
 */
import { applyGlossary, normalizeComponentTags } from './chunk.mjs';

/** 实测边界：50k 字符被拒（400077），45k 通过。留 10% 余量给 JSON 包裹开销。 */
const MAX_CHARS_PER_REQUEST = 45_000;

/** 每个元素在 JSON body 里的固定开销（`{"text":""},` 之类）的保守估计。 */
const PER_ELEMENT_OVERHEAD = 16;

/** 429 / 5xx 的退避重试次数。实测持续压测后 429 滞留约 60s，5 次退避到 16s 够用。 */
const MAX_ATTEMPTS = 5;

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
 * 按字符数切批。
 *
 * 为什么不能只按行数：单篇文档的行长度差异极大（表格行可达数百字符），24 行一批
 * 在长表格上会撞 400077 上限。按字符切是唯一与上限同源的判据。
 */
export function batchByChars(texts, maxChars = MAX_CHARS_PER_REQUEST) {
  const batches = [];
  let current = [];
  let size = 0;

  for (const text of texts) {
    const cost = text.length + PER_ELEMENT_OVERHEAD;
    if (current.length && size + cost > maxChars) {
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Azure Translator 驱动。
 *
 * 语言码与 DeepL 不同源：DeepL 用 `EN`/`ZH`，Azure 用 `en`/`zh-Hans`。由本模块
 * 负责映射，调用方只表达「源/目标语言」这一层意图。
 */
export function createAzureTranslator({ sourceLang = 'en', targetLang = 'zh-Hans', maxAttempts = MAX_ATTEMPTS } = {}) {
  const endpoint = (
    process.env.AZURE_TEXT_TRANSLATE_URL?.trim() || 'https://api.cognitive.microsofttranslator.com/'
  ).replace(/\/?$/u, '/');
  const apiKey = () => process.env.AZURE_TRANSLATE_KEY?.trim() || '';
  const region = () => process.env.AZURE_TRANSLATE_REGION?.trim() || '';

  if (!apiKey()) throw new Error('缺少 AZURE_TRANSLATE_KEY 环境变量（见 docs/i18n.md）');

  async function requestOnce(texts) {
    const url = `${endpoint}translate?api-version=3.0&from=${sourceLang}&to=${targetLang}&textType=html`;
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
      // 429001 = 超频；5xx 是服务端瞬时故障。两者都值得退避重试。
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }

    if (!Array.isArray(payload)) throw new Error(`Azure 响应形态异常：${raw.slice(0, 200)}`);
    return payload.map(item => item?.translations?.[0]?.text);
  }

  /** 发一批（含退避重试），返回等长译文数组。 */
  async function requestBatch(texts) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const translated = await requestOnce(texts);
        if (translated.some(text => typeof text !== 'string')) {
          throw new Error('Azure 响应缺少 translations[0].text');
        }
        return translated;
      } catch (error) {
        if (!error.retryable || attempt >= maxAttempts) throw error;
        const wait = 2 ** (attempt - 1) * 1000;
        console.warn(
          `  ⚠ Azure 限流/瞬时故障，${wait / 1000}s 后重试（第 ${attempt}/${maxAttempts - 1} 次）：${error.message}`
        );
        await sleep(wait);
      }
    }
  }

  return {
    name: `Azure Translator（${sourceLang} → ${targetLang}${region() ? `，${region()}` : ''}）`,

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
