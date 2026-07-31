export { ubeanContentPlugin } from './vite';
export type { UbeanContentOptions } from './vite';

export {
  configureContentRuntime,
  defineCollection,
  getCollection,
  listCollections,
  queryCollection,
  queryCollection as queryContent,
  getContentItem,
  fetchContentNavigation,
  fetchContentNavigation as fetchNavigation,
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
  generateId
} from './core';

export { defineLiveCollection, getLiveCollection, listLiveCollections, clearLiveCollections } from './live';

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

export type {
  LiveCollection,
  LiveCollectionEntry,
  LiveCollectionLoader,
  LiveCollectionLoaderParams,
  LiveCollectionCacheOptions,
  LiveCollectionOptions
} from './live';
