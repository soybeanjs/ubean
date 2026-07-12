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
  fallbackToApi?: boolean;
  iconApiEndpoint?: string;
  ssr?: boolean;
  cssSelectorPrefix?: string;
  cssWherePseudo?: boolean;
  iconifyApiEnabled?: boolean;
}

export interface ResolvedUbeanIconOptions extends Required<Omit<UbeanIconOptions, 'collections'>> {
  collections: Record<string, IconifyCollection | (() => Promise<IconifyCollection>)>;
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
