export interface BuiltinModuleDefinition {
  key: 'icon' | 'pwa' | 'auth' | 'image' | 'fonts' | 'electron' | 'ui';
  modulePath: string;
  factoryExport?: string;
  pluginName: string;
}

export const BUILTIN_MODULES: BuiltinModuleDefinition[] = [
  {
    key: 'icon',
    modulePath: '@ubean/icon/vite',
    factoryExport: 'ubeanIconPlugin',
    pluginName: 'ubean:icon'
  },
  {
    key: 'pwa',
    modulePath: '@ubean/pwa/vite',
    factoryExport: 'ubeanPwaPlugin',
    pluginName: 'ubean:pwa'
  },
  {
    key: 'auth',
    modulePath: '@ubean/auth/vite',
    factoryExport: 'ubeanAuthPlugin',
    pluginName: 'ubean:auth'
  },
  {
    key: 'image',
    modulePath: '@ubean/image/vite',
    factoryExport: 'ubeanImagePlugin',
    pluginName: 'ubean:image'
  },
  {
    key: 'fonts',
    modulePath: '@ubean/fonts/vite',
    factoryExport: 'ubeanFontsPlugin',
    pluginName: 'ubean:fonts'
  },
  {
    key: 'electron',
    modulePath: '@ubean/electron/vite',
    factoryExport: 'ubeanElectronPlugin',
    pluginName: 'ubean:electron'
  },
  {
    key: 'ui',
    modulePath: '@ubean/ui/vite',
    factoryExport: 'ubeanUiPlugin',
    pluginName: 'ubean:ui'
  }
];

export function getBuiltinModuleByKey(key: string): BuiltinModuleDefinition | undefined {
  return BUILTIN_MODULES.find(m => m.key === key);
}

export function isBuiltinModuleConfig(value: unknown): value is { disabled?: boolean } & Record<string, unknown> {
  return value === true || (typeof value === 'object' && value !== null);
}

export function extractBuiltinOptions(value: unknown): Record<string, unknown> {
  if (value === true) return {};
  if (typeof value === 'object' && value !== null) {
    const { disabled: _disabled, ...options } = value as Record<string, unknown>;
    return options;
  }
  return {};
}

export function isBuiltinDisabled(value: unknown): boolean {
  if (value === false) return true;
  if (value === true) return false;
  if (typeof value === 'object' && value !== null) {
    return (value as Record<string, unknown>).disabled === true;
  }
  return true;
}
