export type ContentType = 'markdown' | 'mdx' | 'json' | 'yaml' | 'csv' | 'html';

export interface ContentDocument {
  _id: string;
  _path: string;
  _dir: string;
  _file: string;
  _type: ContentType;
  _extension: string;
  _draft: boolean;
  _partial: boolean;
  _empty: boolean;
  title?: string;
  description?: string;
  date?: string;
  draft?: boolean;
  partial?: boolean;
  navigation?: boolean | { title?: string; order?: number };
  body?: ContentBody;
  [key: string]: any;
}

export interface ContentBody {
  type: 'root';
  children: MarkdownNode[];
  toc?: ContentTocItem[];
  excerpt?: string;
}

export interface MarkdownNode {
  type: string;
  tag?: string;
  value?: string;
  props?: Record<string, any>;
  children?: MarkdownNode[];
}

export interface ContentTocItem {
  id: string;
  depth: number;
  text: string;
  children: ContentTocItem[];
}

export interface ContentCollection {
  name: string;
  source: string;
  type?: ContentType;
  schema?: ContentSchema;
  documents: ContentDocument[];
  list: () => Promise<ContentDocument[]>;
  getItem: (path: string) => Promise<ContentDocument | null>;
  query: () => ContentQueryBuilder;
}

export interface ContentFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'markdown' | 'json';
  required?: boolean;
  default?: any;
  items?: ContentFieldSchema;
  properties?: Record<string, ContentFieldSchema>;
  description?: string;
  enum?: any[];
  format?: string;
}

export interface ContentSchema {
  title?: string;
  description?: string;
  type: 'object';
  properties: Record<string, ContentFieldSchema>;
  required?: string[];
}

export interface ContentQueryBuilder {
  where(field: string, operator: string, value: any): ContentQueryBuilder;
  where(query: Record<string, any>): ContentQueryBuilder;
  sort(field: string, direction?: 'asc' | 'desc'): ContentQueryBuilder;
  limit(count: number): ContentQueryBuilder;
  skip(count: number): ContentQueryBuilder;
  only(fields: string[]): ContentQueryBuilder;
  without(fields: string[]): ContentQueryBuilder;
  find(): Promise<ContentDocument[]>;
  findOne(): Promise<ContentDocument | null>;
  findSurround(path: string, options?: { before?: number; after?: number }): Promise<ContentDocument[]>;
  count(): Promise<number>;
}

export interface ContentModuleOptions {
  sources: Record<string, ContentSourceConfig>;
  defaultSource: string;
  markdown: MarkdownOptions;
  highlight: HighlightOptions;
  navigation: boolean;
  experimental: {
    advancedSyntax: boolean;
  };
}

export interface ContentSourceConfig {
  driver: 'fs' | 'github' | 'http' | 'custom';
  base?: string;
  dirname?: string;
  prefix?: string;
  driverOptions?: Record<string, any>;
}

export interface MarkdownOptions {
  toc: {
    depth: number;
    searchDepth: number;
  };
  anchorLinks: boolean;
  externalLinks: boolean;
  tables: boolean;
  footnotes: boolean;
  mdc: boolean;
  remarkPlugins: any[];
  rehypePlugins: any[];
}

export interface HighlightOptions {
  theme: string | Record<string, string>;
  preload: string[];
  langs: string[];
  wrapperStyle: boolean;
}

export interface ParsedContentMeta {
  _id: string;
  _path: string;
  _file: string;
  _dir: string;
  _draft: boolean;
  _partial: boolean;
  _type: ContentType;
  _extension: string;
  _empty: boolean;
  title?: string;
  description?: string;
  date?: string;
  draft?: boolean;
  partial?: boolean;
  navigation?: boolean;
}

export interface ContentNavigationItem {
  title: string;
  path: string;
  id: string;
  draft?: boolean;
  children?: ContentNavigationItem[];
}

/**
 * 全文检索的文档章节（数据原语）。
 *
 * 将文档按标题层级切分为可搜索的 sections，与搜索引擎解耦：
 * 构建时序列化为静态 JSON（`__search.json`），客户端可交给
 * MiniSearch / Fuse.js 或内置 fallback 引擎。
 */
export interface SearchSection {
  /** `页面路径` 或 `页面路径#锚点` */
  id: string;
  /** 章节标题（首段无标题时为页面标题） */
  title: string;
  /** 父级标题链（面包屑），如 `['指南', '安装']` */
  titles: string[];
  /** 标题层级，首段为 0，h1~h6 为 1~6 */
  level: number;
  /** 章节纯文本内容 */
  content: string;
}

/** `queryCollectionSearchSections` / `generateSearchSections` 的切分选项 */
export interface GenerateSearchSectionsOptions {
  /** 提取文本时忽略的标签（如 `['pre', 'code']`），默认 `['pre']` */
  ignoredTags?: string[];
  /** 切分的最小标题级别（默认 1，即 h1 起切分） */
  minHeading?: 1 | 2 | 3 | 4 | 5 | 6;
  /** 切分的最大标题级别（默认 6） */
  maxHeading?: 1 | 2 | 3 | 4 | 5 | 6;
}

/** 搜索命中结果（引擎无关） */
export interface SearchHit {
  id: string;
  title: string;
  titles: string[];
  level: number;
  content: string;
  /** 相关性得分，越高越相关 */
  score: number;
}

/** 章节搜索引擎实例（MiniSearch 或内置 fallback） */
export interface SectionSearchEngine {
  engine: 'minisearch' | 'fallback';
  search(query: string, options?: SectionQueryOptions): SearchHit[];
}

/** 引擎查询选项 */
export interface SectionQueryOptions {
  limit?: number;
  /** 标题命中权重（默认 4） */
  titleBoost?: number;
  /** 正文命中权重（默认 1） */
  contentBoost?: number;
}

/** `createSectionSearch` 的引擎选项 */
export interface SectionSearchOptions {
  /** MiniSearch 选项（fields/storeFields 由内部固定，此处可传 tokenize/processTerm） */
  miniSearch?: Record<string, any>;
  /** MiniSearch 搜索选项（默认 `{ prefix: true, fuzzy: 0.2 }`） */
  searchOptions?: Record<string, any>;
  /**
   * 注入 MiniSearch 模块加载器。**浏览器场景必须提供。**
   *
   * 包内的默认加载是 `import(变量)` + `@vite-ignore`，只在 Node 下有效
   * （Node 运行时解析裸说明符）；浏览器 ESM 不认裸模块名，会抛
   * `Failed to resolve module specifier "minisearch"` 并被静默降级。
   *
   * 由应用侧注入，字面量 import 就落在应用源码里，Vite 可正常解析/预打包：
   *
   * ```ts
   * useContentSearch({ searchOptions: { loadMiniSearch: () => import('minisearch') } });
   * ```
   */
  loadMiniSearch?: () => Promise<any>;
}

/** 内容搜索配置（`UbeanContentOptions.search`） */
export interface ContentSearchOptions {
  /**
   * SSG 搜索引擎：`'pagefind'`（默认）构建后扫描静态 HTML 生成分片索引；
   * `false` 禁用。pagefind 未安装时构建端优雅跳过。
   */
  provider?: 'pagefind' | false;
  /**
   * 构建时输出 sections JSON payload（`__search.json`），
   * 供 `useContentSearch` / 自定义引擎使用。默认 `true`。
   */
  sections?: boolean;
  /** 透传给 Pagefind Node API `createIndex()` 的选项 */
  pagefind?: Record<string, any>;
}
