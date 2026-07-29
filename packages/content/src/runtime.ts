import {
  parseContent,
  createQueryBuilder,
  buildNavigation,
  createContentCollection,
  defineContentCollection,
  generateId,
  parseFrontmatter,
  parseMarkdown
} from './core';
import type {
  ContentDocument,
  ContentCollection,
  ContentQueryBuilder,
  ContentNavigationItem,
  ContentModuleOptions,
  ContentSchema
} from './types';

let collections: Map<string, ContentCollection> = new Map();
let navigationCache: ContentNavigationItem[] | null = null;

export function configureContentRuntime(_options: Partial<ContentModuleOptions> = {}) {
  collections = new Map();
  navigationCache = null;
}

export function defineCollection(config: {
  name: string;
  source: string;
  type?: any;
  schema?: ContentSchema;
}): ContentCollection {
  const collection = createContentCollection(config.name, config.source);
  collections.set(config.name, collection);
  navigationCache = null;
  return collection;
}

export function getCollection(name: string): ContentCollection | undefined {
  return collections.get(name);
}

export function listCollections(): string[] {
  return Array.from(collections.keys());
}

export async function queryCollection(name: string): Promise<ContentQueryBuilder> {
  const collection = collections.get(name);
  if (!collection) {
    throw new Error(`Collection "${name}" not found. Available collections: ${listCollections().join(', ')}`);
  }
  const docs = await collection.list();
  return createQueryBuilder(docs);
}

export async function getContentItem(collection: string, path: string): Promise<ContentDocument | null> {
  const col = collections.get(collection);
  if (!col) return null;
  return col.getItem(path);
}

export async function fetchContentNavigation(collectionName?: string): Promise<ContentNavigationItem[]> {
  if (navigationCache && !collectionName) return navigationCache;

  let allDocs: ContentDocument[] = [];
  if (collectionName) {
    const col = collections.get(collectionName);
    if (col) {
      allDocs = await col.list();
    }
  } else {
    for (const col of collections.values()) {
      const docs = await col.list();
      allDocs.push(...docs);
    }
  }

  const nav = buildNavigation(allDocs);
  if (!collectionName) {
    navigationCache = nav;
  }
  return nav;
}

export function registerContent(collectionName: string, documents: ContentDocument[]): ContentCollection {
  let collection = collections.get(collectionName);
  if (!collection) {
    collection = defineContentCollection({
      name: collectionName,
      source: collectionName,
      documents
    });
    collections.set(collectionName, collection);
  } else {
    collection.documents.push(...documents);
  }
  navigationCache = null;
  return collection;
}

export function parseContentFile(raw: string, filePath: string, options?: { type?: string }): ContentDocument {
  return parseContent(raw, filePath, options);
}

export {
  parseContent,
  parseFrontmatter,
  parseMarkdown,
  createQueryBuilder,
  buildNavigation,
  createContentCollection,
  defineContentCollection,
  generateId
};

export type {
  ContentDocument,
  ContentCollection,
  ContentQueryBuilder,
  ContentNavigationItem,
  ContentSourceConfig,
  ContentModuleOptions,
  ContentSchema,
  ContentBody,
  MarkdownNode,
  ContentTocItem,
  ContentType
} from './types';
