export {
  isPagesRequest,
  safeJsonStringify,
  serializePageData,
  pageJsonResponse,
  buildPageShell,
  buildClientOnlyShell,
  insertSsrContent,
  insertStateContent,
  renderPage,
  renderPageToStream,
  PAGE_DATA_ID,
  LOCALE_DATA_ID,
  STATE_DATA_ID,
  PAGE_REQUEST_HEADER,
  SSR_CONTENT_MARKER,
  STATE_MARKER
} from './protocol';

export {
  defineDataKey,
  useData,
  invalidateData,
  invalidateAll,
  clearDataCache,
  hasData,
  declareDependencies,
  withDependencies,
  getInvalidatedKeysForAction,
  createInternalFetch,
  createStreamResponse,
  createSseStream
} from './data';

export type { PageHead, PageHead as PageHeadMeta } from '@ubean/types';

export type {
  PageObject,
  PageAssetTags,
  PageRenderFn,
  PageStreamRenderFn,
  PageRenderResult,
  PageRenderer,
  PageRenderContext,
  LocaleMetaInfo
} from './protocol';

export type {
  DataKey,
  DataCacheEntry,
  UseDataOptions,
  DataResult,
  DependencyDeclaration,
  InternalFetchOptions,
  StreamHelper
} from './data';
