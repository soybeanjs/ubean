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

export type {
  LiveCollection,
  LiveCollectionEntry,
  LiveCollectionLoader,
  LiveCollectionLoaderParams,
  LiveCollectionCacheOptions,
  LiveCollectionOptions
} from './live';
