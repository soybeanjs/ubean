declare module 'ubean:locales' {
  export function loadLocale(code: string): Promise<Record<string, unknown>>;
  export function loadLocales(): Promise<void>;
  export const localeCodes: string[];
  export const i18nConfig: unknown;
}
