import type { IconifyCollection, IconifyIconData, ResolvedIconData, IconCollectionLoader } from './types';

const loadedCollections = new Map<string, IconifyCollection>();
const collectionLoaders = new Map<string, IconCollectionLoader>();

export function parseIconName(name: string): { collection: string; icon: string } | null {
  if (!name || typeof name !== 'string') return null;
  const sep = name.indexOf(':');
  if (sep === -1) return null;
  const collection = name.slice(0, sep);
  const icon = name.slice(sep + 1);
  if (!collection || !icon) return null;
  return { collection, icon };
}

export function normalizeIconName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:-]/g, '');
}

export function registerCollection(collection: IconifyCollection): void {
  loadedCollections.set(collection.prefix, collection);
}

export function registerCollectionLoader(loader: IconCollectionLoader): void {
  collectionLoaders.set(loader.prefix, loader);
}

export async function loadCollection(prefix: string): Promise<IconifyCollection | null> {
  if (loadedCollections.has(prefix)) {
    return loadedCollections.get(prefix)!;
  }
  const loader = collectionLoaders.get(prefix);
  if (loader) {
    const collection = await loader.load();
    loadedCollections.set(prefix, collection);
    return collection;
  }
  return null;
}

export function getLoadedCollection(prefix: string): IconifyCollection | undefined {
  return loadedCollections.get(prefix);
}

export function resolveAlias(
  collection: IconifyCollection,
  iconName: string,
  visited: Set<string> = new Set()
): IconifyIconData | null {
  if (visited.has(iconName)) return null;
  visited.add(iconName);

  const icon = collection.icons[iconName];
  if (icon) return icon;

  const alias = collection.aliases?.[iconName];
  if (!alias) return null;

  const parentData = resolveAlias(collection, alias.parent, visited);
  if (!parentData) return null;

  return {
    ...parentData,
    ...alias,
    body: alias.body ?? parentData.body
  };
}

export function getIconData(collection: IconifyCollection, iconName: string): IconifyIconData | null {
  const icon = resolveAlias(collection, iconName);
  if (!icon) return null;
  return icon;
}

export function resolveIconData(
  collection: IconifyCollection,
  iconName: string,
  overrides?: Partial<Pick<IconifyIconData, 'width' | 'height' | 'rotate' | 'hFlip' | 'vFlip'>>
): ResolvedIconData | null {
  const icon = getIconData(collection, iconName);
  if (!icon) return null;

  const width = overrides?.width ?? icon.width ?? collection.width ?? 24;
  const height = overrides?.height ?? icon.height ?? collection.height ?? 24;

  let body = icon.body;
  const rotate = overrides?.rotate ?? icon.rotate ?? 0;
  const hFlip = overrides?.hFlip ?? icon.hFlip ?? false;
  const vFlip = overrides?.vFlip ?? icon.vFlip ?? false;

  const transforms: string[] = [];
  if (rotate) {
    transforms.push(`rotate(${rotate * 90} ${width / 2} ${height / 2})`);
  }
  if (hFlip) {
    transforms.push(`translate(${width} 0) scale(-1 1)`);
  }
  if (vFlip) {
    transforms.push(`translate(0 ${height}) scale(1 -1)`);
  }

  if (transforms.length > 0) {
    body = `<g transform="${transforms.join(' ')}">${body}</g>`;
  }

  const viewBox = icon.viewBox ?? `0 0 ${width} ${height}`;

  return { body, width, height, viewBox };
}

export function generateSvg(
  resolved: ResolvedIconData,
  options?: {
    className?: string;
    style?: Record<string, string>;
    ariaHidden?: boolean;
    ariaLabel?: string;
    title?: string;
  }
): string {
  const { body, width, height, viewBox } = resolved;
  const { className, style, ariaHidden = true, ariaLabel, title } = options ?? {};

  const attrs: string[] = [
    'xmlns="http://www.w3.org/2000/svg"',
    `viewBox="${viewBox}"`,
    `width="${width}"`,
    `height="${height}"`
  ];

  if (className) {
    attrs.push(`class="${className}"`);
  }

  if (style) {
    const styleStr = Object.entries(style)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
      .join(';');
    attrs.push(`style="${styleStr}"`);
  }

  if (ariaHidden && !ariaLabel) {
    attrs.push('aria-hidden="true"');
  } else if (ariaLabel) {
    attrs.push(`role="img" aria-label="${ariaLabel}"`);
  }

  let titleTag = '';
  if (title) {
    titleTag = `<title>${escapeHtml(title)}</title>`;
  }

  return `<svg ${attrs.join(' ')}>${titleTag}${body}</svg>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function getIcon(name: string): Promise<ResolvedIconData | null> {
  const parsed = parseIconName(name);
  if (!parsed) return null;

  const collection = await loadCollection(parsed.collection);
  if (!collection) return null;

  return resolveIconData(collection, parsed.icon);
}

export function getIconSync(name: string): ResolvedIconData | null {
  const parsed = parseIconName(name);
  if (!parsed) return null;

  const collection = loadedCollections.get(parsed.collection);
  if (!collection) return null;

  return resolveIconData(collection, parsed.icon);
}

export function listLoadedCollections(): string[] {
  return Array.from(loadedCollections.keys());
}

export function clearCollections(): void {
  loadedCollections.clear();
  collectionLoaders.clear();
}

export function scanVueSfcForIcons(source: string): Set<string> {
  const icons = new Set<string>();
  const attrPattern = /(?:icon|name)\s*=\s*["']([^"']*:[^"']*)["']/g;
  const boundAttrPattern = /:(?:icon|name)\s*=\s*["']([^"']*:[^"']*)["']/g;
  const iconFnPattern = /(?:getIcon|useIcon)\(\s*["']([^"']*:[^"']*)["']\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(source)) !== null) {
    const name = normalizeIconName(match[1]);
    if (parseIconName(name)) {
      icons.add(name);
    }
  }
  while ((match = boundAttrPattern.exec(source)) !== null) {
    const name = normalizeIconName(match[1]);
    if (parseIconName(name)) {
      icons.add(name);
    }
  }
  while ((match = iconFnPattern.exec(source)) !== null) {
    const name = normalizeIconName(match[1]);
    if (parseIconName(name)) {
      icons.add(name);
    }
  }

  return icons;
}

const SVG_TAG_RE = /<svg([^>]*)>([\s\S]*?)<\/svg>/i;
const SVG_ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^"'<>`\s]+))/g;

export function parseSvgToIconData(svg: string): IconifyIconData | null {
  const match = SVG_TAG_RE.exec(svg);
  if (!match) return null;

  const attrs = match[1];
  const body = match[2].trim();

  if (!body) return null;

  const attrMap: Record<string, string> = {};
  let attrMatch: RegExpExecArray | null;
  SVG_ATTR_RE.lastIndex = 0;
  while ((attrMatch = SVG_ATTR_RE.exec(attrs)) !== null) {
    const name = attrMatch[1].toLowerCase();
    const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
    attrMap[name] = value;
  }

  const result: IconifyIconData = { body };

  const width = parseNumber(attrMap.width);
  const height = parseNumber(attrMap.height);
  if (width) result.width = width;
  if (height) result.height = height;

  const viewBox = attrMap.viewbox;
  if (viewBox) {
    result.viewBox = viewBox;
    const parts = viewBox
      .split(/[\s,]+/)
      .map(Number)
      .filter(n => !Number.isNaN(n));
    if (parts.length === 4 && (!width || !height)) {
      const vbWidth = parts[2];
      const vbHeight = parts[3];
      if (!width && vbWidth) result.width = vbWidth;
      if (!height && vbHeight) result.height = vbHeight;
    }
  }

  const rootAttrs: string[] = [];
  for (const attr of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit']) {
    if (attrMap[attr]) {
      rootAttrs.push(`${attr}="${escapeHtml(attrMap[attr])}"`);
    }
  }

  return result;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function createCollectionFromSvgMap(prefix: string, icons: Record<string, string>): IconifyCollection {
  const iconData: Record<string, IconifyIconData> = {};
  let collectionWidth: number | undefined;
  let collectionHeight: number | undefined;
  let viewBoxSet = false;

  for (const [name, svg] of Object.entries(icons)) {
    const data = parseSvgToIconData(svg);
    if (data) {
      iconData[name] = data;
      if (data.width && !collectionWidth && !viewBoxSet) collectionWidth = data.width;
      if (data.height && !collectionHeight && !viewBoxSet) collectionHeight = data.height;
    }
  }

  const collection: IconifyCollection = { prefix, icons: iconData };
  if (collectionWidth) collection.width = collectionWidth;
  if (collectionHeight) collection.height = collectionHeight;

  return collection;
}
