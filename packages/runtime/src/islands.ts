import { createApp, h, defineComponent } from 'vue';
import type { Component, App as VueApp } from 'vue';

interface DomElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  hasAttribute(name: string): boolean;
}

interface NodeListOf<T> {
  forEach(callback: (value: T, key: number, parent: NodeListOf<T>) => void): void;
}

interface DomParentNode {
  querySelectorAll(selector: string): NodeListOf<DomElement>;
}

interface MutationObserverCallback {
  (): void;
}

interface MutationObserver {
  observe(target: DomElement, options: { attributes: boolean; attributeFilter: string[] }): void;
  disconnect(): void;
}

interface MutationObserverConstructor {
  new (callback: MutationObserverCallback): MutationObserver;
}

interface RequestIdleCallbackOptions {
  timeout?: number;
}

interface RequestIdleCallbackDeadline {
  didTimeout: boolean;
  timeRemaining(): number;
}

interface IntersectionObserverEntry {
  isIntersecting: boolean;
}

interface IntersectionObserverCallback {
  (entries: IntersectionObserverEntry[]): void;
}

interface IntersectionObserver {
  observe(target: DomElement): void;
  disconnect(): void;
}

interface IntersectionObserverConstructor {
  new (callback: IntersectionObserverCallback, options?: { rootMargin?: string }): IntersectionObserver;
}

interface MediaQueryListEvent {
  matches: boolean;
}

interface MediaQueryList {
  matches: boolean;
  addEventListener(type: 'change', listener: (e: MediaQueryListEvent) => void): void;
  removeEventListener(type: 'change', listener: (e: MediaQueryListEvent) => void): void;
  addListener?(listener: (e: MediaQueryListEvent) => void): void;
  removeListener?(listener: (e: MediaQueryListEvent) => void): void;
}

interface WindowWithMatchMedia {
  matchMedia(query: string): MediaQueryList;
}

interface BrowserDocument extends DomParentNode {
  querySelectorAll(selector: string): NodeListOf<DomElement>;
}

interface GlobalWithBrowserAPIs {
  MutationObserver?: MutationObserverConstructor;
  requestIdleCallback?: (
    callback: (deadline: RequestIdleCallbackDeadline) => void,
    options?: RequestIdleCallbackOptions
  ) => number;
  IntersectionObserver?: IntersectionObserverConstructor;
  window?: WindowWithMatchMedia;
  document?: BrowserDocument;
}

interface VueAppInternal {
  _context?: {
    provides?: Record<string | symbol, unknown>;
  };
}

const _global = globalThis as unknown as GlobalWithBrowserAPIs;

export interface IslandHydrateOptions {
  getComponent?: (name: string) => Component | Promise<Component> | null;
  appContext?: VueApp;
  onHydrated?: (el: DomElement, component: Component) => void;
}

export interface IslandRecord {
  el: DomElement;
  id: string;
  componentName: string;
  directive: string;
  mediaQuery?: string;
  props: Record<string, unknown>;
}

function decodeProps(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(
      raw
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
    );
  } catch {
    return {};
  }
}

export function collectIslands(root?: DomParentNode): IslandRecord[] {
  const doc = root ?? _global.document;
  if (!doc) return [];
  const nodes = doc.querySelectorAll('ubean-island[data-island-id]');
  const records: IslandRecord[] = [];
  nodes.forEach(el => {
    const domEl = el as DomElement;
    const id = domEl.getAttribute('data-island-id') || '';
    const componentName = domEl.getAttribute('data-component') || '';
    const directive = domEl.getAttribute('data-directive') || 'client:load';
    const mediaQuery = domEl.getAttribute('data-media') || undefined;
    const props = decodeProps(domEl.getAttribute('data-props'));
    records.push({ el: domEl, id, componentName, directive, mediaQuery, props });
  });
  return records;
}

export function hydrateIsland(record: IslandRecord, component: Component, options: IslandHydrateOptions = {}): void {
  if (record.el.hasAttribute('data-hydrated')) return;
  record.el.setAttribute('data-hydrated', 'true');

  const ChildComponent = defineComponent({
    name: `Island-${record.componentName}`,
    setup() {
      return () => h(component, record.props);
    }
  });

  const app = createApp(ChildComponent);

  if (options.appContext) {
    if (options.appContext.config?.globalProperties) {
      Object.assign(app.config.globalProperties, options.appContext.config.globalProperties);
    }
    const appContextInternal = options.appContext as unknown as VueAppInternal;
    if (appContextInternal._context?.provides) {
      for (const [key, value] of Object.entries(appContextInternal._context.provides)) {
        app.provide(key, value);
      }
    }
  }

  app.mount(record.el as unknown as Element);
  options.onHydrated?.(record.el, component);
}

export interface HydrateIslandsOptions extends IslandHydrateOptions {
  root?: DomParentNode;
  components?: Record<string, Component | (() => Promise<Component>)>;
}

export function hydrateIslands(options: HydrateIslandsOptions = {}): void {
  const { root, components = {}, getComponent, ...rest } = options;
  const islands = collectIslands(root);
  if (islands.length === 0) return;

  for (const record of islands) {
    if (record.directive === 'client:only') {
      const comp = resolveComponent(record.componentName, components, getComponent);
      if (comp) {
        Promise.resolve(comp)
          .then(c => {
            hydrateIsland(record, c, rest);
          })
          .catch(e => console.error('[ubean:islands] hydrate error:', record.componentName, e));
      }
      continue;
    }

    const doHydrate = () => {
      const comp = resolveComponent(record.componentName, components, getComponent);
      if (comp) {
        Promise.resolve(comp)
          .then(c => {
            hydrateIsland(record, c, rest);
          })
          .catch(e => console.error('[ubean:islands] hydrate error:', record.componentName, e));
      }
    };

    // If the bootstrap script already set data-hydrating, hydrate immediately
    if (record.el.getAttribute('data-hydrating') === 'true' && !record.el.hasAttribute('data-hydrated')) {
      doHydrate();
      continue;
    }

    // Also set up MutationObserver as fallback (for bootstrap script triggers)
    const MutationObserverCtor = _global.MutationObserver ?? null;

    if (MutationObserverCtor) {
      const observer = new MutationObserverCtor(() => {
        if (record.el.getAttribute('data-hydrating') === 'true' && !record.el.hasAttribute('data-hydrated')) {
          observer.disconnect();
          doHydrate();
        }
      });
      observer.observe(record.el, { attributes: true, attributeFilter: ['data-hydrating'] });
    }

    // Directly implement directive-based hydration strategies
    // (in case the bootstrap script doesn't run or runs too late)
    const directive = record.directive;

    if (directive === 'client:load') {
      doHydrate();
    } else if (directive === 'client:idle') {
      const ric = _global.requestIdleCallback;
      if (typeof ric === 'function') {
        ric(() => doHydrate(), { timeout: 2000 });
      } else {
        setTimeout(doHydrate, 200);
      }
    } else if (directive === 'client:visible') {
      const IOCtor = _global.IntersectionObserver;
      if (typeof IOCtor === 'function') {
        const io = new IOCtor(
          (entries: IntersectionObserverEntry[]) => {
            entries.forEach((entry: IntersectionObserverEntry) => {
              if (entry.isIntersecting) {
                io.disconnect();
                doHydrate();
              }
            });
          },
          { rootMargin: '200px' }
        );
        io.observe(record.el);
      } else {
        doHydrate();
      }
    } else if (directive === 'client:media' && record.mediaQuery) {
      const mql = _global.window?.matchMedia?.(record.mediaQuery);
      if (mql) {
        if (mql.matches) {
          doHydrate();
        } else {
          const fn = (e: MediaQueryListEvent) => {
            if (e.matches) {
              doHydrate();
              if (mql.removeEventListener) {
                mql.removeEventListener('change', fn);
              } else if (mql.removeListener) {
                mql.removeListener(fn);
              }
            }
          };
          if (mql.addEventListener) {
            mql.addEventListener('change', fn);
          } else if (mql.addListener) {
            mql.addListener(fn);
          }
        }
      } else {
        doHydrate();
      }
    } else {
      // Default: hydrate immediately
      doHydrate();
    }
  }
}

function resolveComponent(
  name: string,
  components: Record<string, Component | (() => Promise<Component>)>,
  getComponent?: (name: string) => Component | Promise<Component> | null
): Component | Promise<Component> | null {
  if (components[name]) return components[name];
  if (getComponent) return getComponent(name);

  // 诊断警告:组件未在注册表中找到,输出可能原因与已注册组件列表
  // 帮助快速定位「island 静默不水合」问题(常见于组件名不匹配或忘记注册)
  const registered = Object.keys(components);
  // eslint-disable-next-line no-console
  console.warn(
    `[ubean:islands] Island component "${name}" not found in registry.\n` +
      `Possible causes:\n` +
      `  1. Component is globally registered or dynamically imported — pass it via hydrateIslands({ components: { ${name}: YourComp } })\n` +
      `  2. Component name mismatch between template tag and import\n` +
      `  3. Component is auto-imported by unplugin-vue-components (no static import → not in auto-registry)\n` +
      `Registered components: ${registered.length > 0 ? registered.join(', ') : '(none)'}`
  );
  return null;
}
