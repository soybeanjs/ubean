export { ubeanContentPlugin } from './vite';
export type { UbeanContentOptions } from './vite';

export {
  configureContentRuntime,
  defineCollection,
  getCollection,
  listCollections,
  queryCollection,
  queryCollection as queryContent,
  queryCollectionSearchSections,
  getContentItem,
  fetchContentNavigation,
  fetchContentNavigation as fetchNavigation,
  registerContent,
  parseContentFile,
  bootstrapContentFromDisk
} from './runtime';

export { scanContentSources } from './scan';
export type { ScanContentSourcesOptions, ContentSourceScanConfig } from './scan';

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

export {
  splitDocumentIntoSearchSections,
  generateSearchSections,
  generateSearchSectionsSnapshot,
  tokenizeText,
  createSectionSearch,
  searchSections,
  resolveContentSearchConfig,
  runPagefindIndex
} from './search';
export type { PagefindIndexOptions, PagefindIndexResult, ResolvedContentSearchConfig } from './search';

export { extractContentPageRoutes, discoverContentPageRoutes } from './routing';
export type { ContentPageRouteOptions, DiscoverContentPageRoutesOptions } from './routing';

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
  ParsedContentMeta,
  SearchSection,
  SearchHit,
  SectionSearchEngine,
  SectionSearchOptions,
  SectionQueryOptions,
  GenerateSearchSectionsOptions,
  ContentSearchOptions
} from './types';

export {
  // P9-19: Live Content Collections —— 运行时按需从外部源（CMS / API / DB）取内容。
  // 值导出此前漏在包入口外，导致该功能只能通过 `@ubean/content/src/live` 这类
  // 深路径消费（发布产物里没有该子路径）。补上后它与 `queryCollection` 同级公开。
  defineLiveCollection,
  getLiveCollection,
  listLiveCollections,
  clearLiveCollections
} from './live';

export type {
  LiveCollection,
  LiveCollectionEntry,
  LiveCollectionLoader,
  LiveCollectionLoaderParams,
  LiveCollectionCacheOptions,
  LiveCollectionOptions
} from './live';
