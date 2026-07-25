export interface IconifyCollection {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, IconifyIconData>;
  aliases?: Record<string, IconifyAlias>;
}

export interface IconifyIconData {
  body: string;
  width?: number;
  height?: number;
  viewBox?: string;
  rotate?: number;
  hFlip?: boolean;
  vFlip?: boolean;
}

export interface IconifyAlias extends Partial<IconifyIconData> {
  parent: string;
}

export interface ResolvedIconData {
  body: string;
  width?: number;
  height?: number;
  viewBox?: string;
}

export interface UbeanIconOptions {
  collections?: Record<string, IconifyCollection | (() => Promise<IconifyCollection>)>;
  customCollections?: Record<string, string | CustomCollectionDirConfig>;
  fallbackToApi?: boolean;
  iconApiEndpoint?: string;
  ssr?: boolean;
  cssSelectorPrefix?: string;
  cssWherePseudo?: boolean;
  iconifyApiEnabled?: boolean;
}

export interface CustomCollectionDirConfig {
  dir: string;
  prefix?: string;
  normalizeIconName?: (name: string) => string;
}

export interface ResolvedCustomCollection {
  prefix: string;
  dir: string;
  normalizeIconName: (name: string) => string;
}

export interface ResolvedUbeanIconOptions extends Required<
  Omit<UbeanIconOptions, 'collections' | 'customCollections'>
> {
  collections: Record<string, IconifyCollection | (() => Promise<IconifyCollection>)>;
  customCollections: Record<string, ResolvedCustomCollection>;
}

export interface IconCollectionLoader {
  prefix: string;
  load: () => Promise<IconifyCollection>;
}

export interface ScannedIconUsage {
  name: string;
  collection: string;
  icon: string;
}
