import type { PageObject } from '@ubean/pages';

interface MinimalElement {
  textContent: string | null;
}

interface MinimalDocument {
  getElementById(id: string): MinimalElement | null;
}

interface GlobalWithUbeanData {
  document?: MinimalDocument;
  __UBEAN_PAGE_DATA__?: PageObject | null;
  __UBEAN_STATE__?: Record<string, unknown> | null;
}

const _global = globalThis as GlobalWithUbeanData;

export function getInitialPageData<T = Record<string, unknown>>(): PageObject<T> | null {
  if (typeof _global.document === 'undefined') return null;
  const doc = _global.document;
  const el = doc.getElementById('__UBEAN_PAGE_DATA__');
  if (!el) return (_global.__UBEAN_PAGE_DATA__ as PageObject<T> | null) ?? null;
  try {
    return JSON.parse(el.textContent || 'null') as PageObject<T> | null;
  } catch {
    return null;
  }
}

/**
 * 从 DOM 中的 `<script id="__UBEAN_STATE__">` 读取 SSR 序列化的状态。
 *
 * 该状态由服务端 `defineApp({ serializeState })` 产生,用于在客户端 mount 前
 * 水合到对应的库实例(如 Pinia 的 `pinia.state.value`)。
 *
 * 必须在 `app.mount()` 之前调用(在 `defineApp({ hydrateState })` 内部使用)。
 *
 * @returns 解析后的状态对象,或 `null`(无状态 / 解析失败 / 非 DOM 环境)
 */
export function getInitialState(): Record<string, unknown> | null {
  if (typeof _global.document === 'undefined') return null;
  const doc = _global.document;
  const el = doc.getElementById('__UBEAN_STATE__');
  if (!el) return (_global.__UBEAN_STATE__ as Record<string, unknown> | null) ?? null;
  try {
    const text = el.textContent || '';
    if (!text.trim()) return null;
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
