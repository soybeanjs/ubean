import { join } from 'pathe';
import type {
  ContentDocument,
  ContentSearchOptions,
  GenerateSearchSectionsOptions,
  MarkdownNode,
  SearchHit,
  SearchSection,
  SectionQueryOptions,
  SectionSearchEngine,
  SectionSearchOptions
} from './types';

/* --------------------------------------------------------------------------
 * Section 切分（数据原语）
 * ------------------------------------------------------------------------ */

const DEFAULT_IGNORED_TAGS = ['pre'];

function extractNodeText(node: MarkdownNode, ignoredTags: string[]): string {
  if (node.type === 'text') {
    return node.value || '';
  }
  if (node.type === 'element') {
    if (ignoredTags.includes(node.tag || '')) return '';
    return (node.children || []).map(child => extractNodeText(child, ignoredTags)).join('');
  }
  return '';
}

function isHeadingNode(node: MarkdownNode): false | { depth: number; text: string; anchor: string } {
  if (node.type !== 'element') return false;
  const match = node.tag?.match(/^h([1-6])$/);
  if (!match) return false;
  return {
    depth: Number(match[1]),
    text: extractNodeText(node, []).trim(),
    anchor: node.props?.id || ''
  };
}

/**
 * 将单个文档按标题层级切分为可搜索的 sections。
 *
 * - 首个标题之前的内容为一个 intro section（level 0，title 为页面标题）
 * - [minHeading, maxHeading] 范围内的标题开启新 section，并维护父级标题链
 * - 范围外的标题（如 minHeading=2 时的 h1）视为正文内容
 * - `_draft` / `_partial` / `_empty` 文档由上层过滤
 */
export function splitDocumentIntoSearchSections(
  doc: ContentDocument,
  options: GenerateSearchSectionsOptions = {}
): SearchSection[] {
  const ignoredTags = options.ignoredTags ?? DEFAULT_IGNORED_TAGS;
  const minHeading = options.minHeading ?? 1;
  const maxHeading = options.maxHeading ?? 6;

  const sections: SearchSection[] = [];
  if (!doc.body?.children?.length) return sections;

  let current: SearchSection | null = null;
  /** 父级标题栈：`[{ level, title }]`，新标题弹出所有 >= 自身 level 的项 */
  const headingStack: Array<{ level: number; title: string }> = [];
  const buffer: string[] = [];

  function pushSection() {
    if (!current) return;
    current.content = buffer.join(' ').replace(/\s+/g, ' ').trim();
    // 无正文的标题章节仍保留（标题本身即可命中）；空的 intro 丢弃
    if (current.content || current.level > 0) {
      sections.push(current);
    }
    buffer.length = 0;
  }

  for (const node of doc.body.children) {
    const heading = isHeadingNode(node);
    if (heading && heading.depth >= minHeading && heading.depth <= maxHeading) {
      pushSection();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= heading.depth) {
        headingStack.pop();
      }
      const titles = headingStack.map(h => h.title);
      headingStack.push({ level: heading.depth, title: heading.text });
      current = {
        id: heading.anchor ? `${doc._path}#${heading.anchor}` : doc._path,
        title: heading.text,
        titles,
        level: heading.depth,
        content: ''
      };
      continue;
    }

    if (!current) {
      current = {
        id: doc._path,
        title: doc.title || doc._path,
        titles: [],
        level: 0,
        content: ''
      };
    }
    const text = extractNodeText(node, ignoredTags);
    if (text.trim()) buffer.push(text.trim());
  }

  pushSection();
  return sections;
}

/** 过滤不可搜索文档（草稿 / partial / 空文件） */
function isSearchableDocument(doc: ContentDocument): boolean {
  return !doc._draft && !doc._partial && !doc._empty;
}

/** 将文档集合批量切分为 sections */
export function generateSearchSections(
  documents: ContentDocument[],
  options: GenerateSearchSectionsOptions = {}
): SearchSection[] {
  return documents.filter(isSearchableDocument).flatMap(doc => splitDocumentIntoSearchSections(doc, options));
}

/** 将 `{ collection: documents }` 快照转换为 `{ collection: sections }` payload */
export function generateSearchSectionsSnapshot(
  snapshot: Record<string, ContentDocument[]>,
  options: GenerateSearchSectionsOptions = {}
): Record<string, SearchSection[]> {
  const payload: Record<string, SearchSection[]> = {};
  for (const [name, documents] of Object.entries(snapshot)) {
    payload[name] = generateSearchSections(documents, options);
  }
  return payload;
}

/* --------------------------------------------------------------------------
 * CJK 感知分词
 * ------------------------------------------------------------------------ */

/** CJK 表意文字 / 假名 / 谚文区间 */
const CJK_REGEX = /[\u2E80-\u9FFF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF\uF900-\uFAFF]/;
const CJK_RUN_REGEX = /[\u2E80-\u9FFF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF\uF900-\uFAFF]+/g;
const WORD_RUN_REGEX = /[\p{L}\p{N}]+/gu;
let segmenter: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
  if (segmenter !== undefined) return segmenter;
  try {
    segmenter = new Intl.Segmenter('en', { granularity: 'word' });
  } catch {
    segmenter = null;
  }
  return segmenter;
}

function segmentCjkRun(run: string): string[] {
  const seg = getSegmenter();
  if (seg) {
    const tokens: string[] = [];
    for (const part of seg.segment(run)) {
      if ((part as any).isWordLike) tokens.push(part.segment.toLowerCase());
    }
    return tokens;
  }
  // 无 Intl.Segmenter 时的降级：unigram + bigram，保证中文子串可命中
  const chars = Array.from(run.toLowerCase());
  const tokens = [...chars];
  for (let i = 0; i < chars.length - 1; i++) {
    tokens.push(chars[i] + chars[i + 1]);
  }
  return tokens;
}

/**
 * CJK 感知分词器（与引擎共用）：
 * - 拉丁词按 Unicode 词字符切分
 * - CJK 连续段优先用 `Intl.Segmenter`（词级），降级为 unigram + bigram
 * - 混合词（如 `vue每个`）按 CJK 子段切分
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  const normalized = text.toLowerCase();
  const tokens: string[] = [];

  let wordMatch: RegExpExecArray | null;
  WORD_RUN_REGEX.lastIndex = 0;
  while ((wordMatch = WORD_RUN_REGEX.exec(normalized)) !== null) {
    const word = wordMatch[0];
    if (!CJK_REGEX.test(word)) {
      tokens.push(word);
      continue;
    }
    // 词内再按 CJK 连续子段切分，保留非 CJK 部分
    let cursor = 0;
    CJK_RUN_REGEX.lastIndex = 0;
    let cjkMatch: RegExpExecArray | null;
    while ((cjkMatch = CJK_RUN_REGEX.exec(word)) !== null) {
      if (cjkMatch.index > cursor) {
        tokens.push(word.slice(cursor, cjkMatch.index));
      }
      tokens.push(...segmentCjkRun(cjkMatch[0]));
      cursor = cjkMatch.index + cjkMatch[0].length;
    }
    if (cursor < word.length) {
      tokens.push(word.slice(cursor));
    }
  }

  return tokens;
}

/* --------------------------------------------------------------------------
 * 搜索引擎（MiniSearch 可选依赖 + 内置 fallback）
 * ------------------------------------------------------------------------ */

function toHit(section: SearchSection, score: number): SearchHit {
  return {
    id: section.id,
    title: section.title,
    titles: section.titles,
    level: section.level,
    content: section.content,
    score
  };
}

/** 内置 fallback 引擎：词元精确/前缀匹配 + 标题加权打分（无编辑距离容错） */
function createFallbackEngine(sections: SearchSection[]): SectionSearchEngine {
  const indexed = sections.map(section => ({
    section,
    titleTokens: tokenizeText(`${section.title} ${section.titles.join(' ')}`),
    contentTokens: tokenizeText(section.content)
  }));

  return {
    engine: 'fallback',
    search(query: string, options: SectionQueryOptions = {}) {
      const terms = tokenizeText(query);
      if (terms.length === 0) return [];
      const titleBoost = options.titleBoost ?? 4;
      const contentBoost = options.contentBoost ?? 1;

      const hits: SearchHit[] = [];
      for (const entry of indexed) {
        let score = 0;
        let matched = false;
        for (const term of terms) {
          let termScore = 0;
          for (const token of entry.titleTokens) {
            if (token === term) {
              termScore = Math.max(termScore, titleBoost);
            } else if (token.startsWith(term)) {
              termScore = Math.max(termScore, titleBoost / 2);
            }
          }
          for (const token of entry.contentTokens) {
            if (token === term) {
              termScore = Math.max(termScore, contentBoost);
            } else if (token.startsWith(term)) {
              termScore = Math.max(termScore, contentBoost / 2);
            }
          }
          if (termScore > 0) matched = true;
          score += termScore;
        }
        if (matched) hits.push(toHit(entry.section, score));
      }

      hits.sort((a, b) => b.score - a.score);
      const limit = options.limit ?? 20;
      return hits.slice(0, limit);
    }
  };
}

/**
 * 创建章节搜索引擎。
 *
 * 优先使用 MiniSearch（可选依赖，支持前缀 + 模糊匹配 + 字段加权），
 * 未安装时降级为内置 fallback 引擎（精确/前缀匹配）。
 * 两条路径共享 CJK 感知分词器。
 */
export async function createSectionSearch(
  sections: SearchSection[],
  options: SectionSearchOptions = {}
): Promise<SectionSearchEngine> {
  const moduleId = 'minisearch';
  let MiniSearch: any = null;
  try {
    const mod: any = await import(/* @vite-ignore */ moduleId);
    MiniSearch = mod.default ?? mod.MiniSearch ?? mod;
  } catch {
    MiniSearch = null;
  }

  if (MiniSearch && typeof MiniSearch === 'function') {
    const miniSearch = new MiniSearch({
      fields: ['title', 'content'],
      storeFields: [],
      tokenize: tokenizeText,
      ...options.miniSearch
    });
    miniSearch.addAll(sections);
    const searchOptions = { prefix: true, fuzzy: 0.2, boost: { title: 4, content: 1 }, ...options.searchOptions };
    return {
      engine: 'minisearch',
      search(query: string, queryOptions: SectionQueryOptions = {}) {
        const limit = queryOptions.limit ?? 20;
        const results: Array<{ id: string; score: number }> = miniSearch.search(query, {
          ...searchOptions,
          boost: {
            ...searchOptions.boost,
            ...(queryOptions.titleBoost !== undefined ? { title: queryOptions.titleBoost } : {}),
            ...(queryOptions.contentBoost !== undefined ? { content: queryOptions.contentBoost } : {})
          }
        });
        const byId = new Map(sections.map(s => [s.id, s]));
        const hits: SearchHit[] = [];
        for (const result of results) {
          const section = byId.get(result.id);
          if (section) hits.push(toHit(section, result.score));
        }
        return hits.slice(0, limit);
      }
    };
  }

  return createFallbackEngine(sections);
}

/** 一次性搜索便捷函数（每次调用重建引擎，适合低频场景；高频场景请缓存 `createSectionSearch` 结果） */
export async function searchSections(
  sections: SearchSection[],
  query: string,
  options: SectionSearchOptions & SectionQueryOptions = {}
): Promise<SearchHit[]> {
  const { miniSearch, searchOptions, ...queryOptions } = options;
  const engine = await createSectionSearch(sections, { miniSearch, searchOptions });
  return engine.search(query, queryOptions);
}

/* --------------------------------------------------------------------------
 * 构建端搜索配置解析
 * ------------------------------------------------------------------------ */

export interface ResolvedContentSearchConfig {
  /** 输出 `__search.json` sections payload */
  sections: boolean;
  /** 构建后运行 Pagefind 索引 */
  pagefind: boolean;
  /** 透传给 Pagefind `createIndex()` 的选项 */
  pagefindOptions: Record<string, any>;
}

/**
 * 解析构建端搜索配置。
 *
 * 默认策略：SSG 模式且内容模块启用时默认开启（pagefind 未安装时优雅跳过）；
 * 其他模式需显式 `content: { search: { provider: 'pagefind' } }` 开启。
 */
export function resolveContentSearchConfig(
  content: boolean | { search?: ContentSearchOptions | false } | undefined,
  context: { ssg: boolean } = { ssg: false }
): ResolvedContentSearchConfig {
  if (content === false) {
    return { sections: false, pagefind: false, pagefindOptions: {} };
  }

  const search = content === true || content === undefined ? undefined : content.search;

  if (search === false || search?.provider === false) {
    return { sections: false, pagefind: false, pagefindOptions: {} };
  }

  const enabled = Boolean(search) || context.ssg;
  return {
    sections: enabled ? (search?.sections ?? true) : false,
    pagefind: enabled,
    pagefindOptions: search?.pagefind ?? {}
  };
}

/* --------------------------------------------------------------------------
 * Pagefind 索引（构建后扫描静态 HTML）
 * ------------------------------------------------------------------------ */

export interface PagefindIndexOptions {
  /** 包含构建产物的静态目录（含 HTML） */
  siteDir: string;
  /** 索引输出目录（默认 `<siteDir>/pagefind`） */
  outputPath?: string;
  /** 传入 `addDirectory` 的 glob（默认匹配所有 `.html` 文件） */
  glob?: string;
  /** 透传给 `createIndex()` 的选项 */
  createIndexOptions?: Record<string, any>;
  logger?: { info?: (msg: string) => void; warn?: (msg: string) => void };
}

export interface PagefindIndexResult {
  indexed: boolean;
  reason?: 'pagefind-not-installed' | 'no-html' | 'error';
  error?: string;
}

/**
 * 构建后运行 Pagefind 索引（Node API）。
 *
 * 扫描 `siteDir` 下的 HTML 生成分片索引（按查询词按需加载，
 * 10k 页站点总网络开销 < 300KB），输出到 `<siteDir>/pagefind/`。
 * `pagefind` 为可选依赖，未安装时返回 `pagefind-not-installed` 由调用方降级提示。
 */
export async function runPagefindIndex(options: PagefindIndexOptions): Promise<PagefindIndexResult> {
  const { siteDir, outputPath, glob, createIndexOptions = {}, logger } = options;

  let pagefind: any;
  try {
    const moduleId = 'pagefind';
    pagefind = await import(/* @vite-ignore */ moduleId);
  } catch {
    return { indexed: false, reason: 'pagefind-not-installed' };
  }

  try {
    const { index } = await pagefind.createIndex(createIndexOptions);
    if (index?.on) {
      index.on('error', (err: unknown) => {
        logger?.warn?.(`[pagefind] index error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    await index.addDirectory({ path: siteDir, glob: glob || '**/*.{html}' });
    await index.writeFiles({ outputPath: outputPath ?? join(siteDir, 'pagefind') });
    logger?.info?.(`[pagefind] search index written to ${outputPath ?? join(siteDir, 'pagefind')}`);
    return { indexed: true };
  } catch (err) {
    return { indexed: false, reason: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
