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
