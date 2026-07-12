import {
  parseIconName,
  normalizeIconName,
  registerCollection,
  registerCollectionLoader,
  loadCollection,
  getLoadedCollection,
  getIconData,
  resolveIconData,
  generateSvg,
  escapeHtml,
  getIcon,
  getIconSync,
  listLoadedCollections,
  clearCollections,
  scanVueSfcForIcons,
  resolveAlias
} from './core';

export {
  parseIconName,
  normalizeIconName,
  registerCollection,
  registerCollectionLoader,
  loadCollection,
  getLoadedCollection,
  getIconData,
  resolveIconData,
  generateSvg,
  escapeHtml,
  getIcon,
  getIconSync,
  listLoadedCollections,
  clearCollections,
  scanVueSfcForIcons,
  resolveAlias
};

export type {
  IconifyCollection,
  IconifyIconData,
  IconifyAlias,
  ResolvedIconData,
  IconCollectionLoader,
  ScannedIconUsage
} from './types';

let config: {
  fallbackToApi: boolean;
  iconApiEndpoint: string;
  ssr: boolean;
  iconifyApiEnabled: boolean;
} = {
  fallbackToApi: true,
  iconApiEndpoint: 'https://api.iconify.design',
  ssr: true,
  iconifyApiEnabled: true
};

export function configureIconRuntime(options: Partial<typeof config>) {
  config = { ...config, ...options };
}

export function getIconConfig() {
  return { ...config };
}

export async function fetchIconFromApi(
  name: string,
  apiEndpoint: string = config.iconApiEndpoint
): Promise<string | null> {
  const parsed = parseIconName(name);
  if (!parsed) return null;

  try {
    const url = `${apiEndpoint}/${parsed.collection}/${parsed.icon}.svg`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function buildIconCssIcon(
  name: string,
  options?: {
    size?: string | number;
    color?: string;
    className?: string;
  }
): { className: string; style: string } {
  const { size = '1em', color = 'currentColor', className = '' } = options ?? {};
  const parsed = parseIconName(name);
  const collection = parsed?.collection || '';
  const icon = parsed?.icon || name;

  const baseClass = `i-${collection}-${icon}`;
  const finalClass = className ? `${baseClass} ${className}` : baseClass;
  const style = `display:inline-block;width:${size};height:${size};color:${color};background-color:currentColor;mask-size:100% 100%;mask-repeat:no-repeat;mask-position:center;-webkit-mask-size:100% 100%;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;`;

  return { className: finalClass, style };
}
