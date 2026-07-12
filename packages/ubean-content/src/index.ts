export { ubeanContentPlugin } from './vite';
export type { UbeanContentOptions } from './vite';

export {
  configureContentRuntime,
  defineCollection,
  getCollection,
  listCollections,
  queryCollection,
  getContentItem,
  fetchContentNavigation,
  registerContent,
  parseContentFile
} from './runtime';

export {
  parseContent,
  parseFrontmatter,
  parseMarkdown,
  createQueryBuilder,
  buildNavigation,
  createContentCollection,
  defineContentCollection,
  generateId,
  normalizePath,
  pathToTitle,
  getDirname,
  getBasename,
  getExtension,
  getStem
} from './core';

export type {
  ContentDocument,
  ContentCollection,
  ContentQueryBuilder,
  ContentNavigationItem,
  ContentSourceConfig,
  ContentModuleOptions,
  ContentSchema,
  ContentFieldSchema,
  ContentBody,
  MarkdownNode,
  ContentTocItem,
  ContentType,
  ParsedContentMeta
} from './types';
