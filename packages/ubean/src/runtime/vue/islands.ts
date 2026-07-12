import { createApp, h, defineComponent } from 'vue';
import type { Component, App as VueApp } from 'vue';

type DomElement = any;
type DomParentNode = any;

declare const document: any;

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

export function collectIslands(root: DomParentNode = document): IslandRecord[] {
  if (typeof document === 'undefined') return [];
  const nodes = root.querySelectorAll('ubean-island[data-island-id]');
  const records: IslandRecord[] = [];
  nodes.forEach((el: DomElement) => {
    const id = el.getAttribute('data-island-id') || '';
    const componentName = el.getAttribute('data-component') || '';
    const directive = el.getAttribute('data-directive') || 'client:load';
    const mediaQuery = el.getAttribute('data-media') || undefined;
    const props = decodeProps(el.getAttribute('data-props'));
    records.push({ el, id, componentName, directive, mediaQuery, props });
  });
  return records;
}

export function hydrateIsland(record: IslandRecord, component: Component, options: IslandHydrateOptions = {}): void {
  if (record.el.hasAttribute('data-hydrated')) return;
  record.el.setAttribute('data-hydrated', 'true');

  const ChildComponent = defineComponent({
    name: `Island-${record.componentName}`,
    setup() {
      return () => h(component as any, record.props as any);
    }
  });

  const app = createApp(ChildComponent);

  if (options.appContext) {
    if (options.appContext.config?.globalProperties) {
      Object.assign(app.config.globalProperties, options.appContext.config.globalProperties);
    }
    if ((options.appContext as any)._context?.provides) {
      for (const [key, value] of Object.entries((options.appContext as any)._context.provides)) {
        app.provide(key as any, value);
      }
    }
  }

  app.mount(record.el);
  options.onHydrated?.(record.el, component);
}

export interface HydrateIslandsOptions extends IslandHydrateOptions {
  root?: DomParentNode;
  components?: Record<string, Component | (() => Promise<Component>)>;
}

export function hydrateIslands(options: HydrateIslandsOptions = {}): void {
  if (typeof document === 'undefined') return;
  const { root = document, components = {}, getComponent, ...rest } = options;
  const islands = collectIslands(root);

  for (const record of islands) {
    if (record.directive === 'client:only') {
      const comp = resolveComponent(record.componentName, components, getComponent);
      if (comp) {
        Promise.resolve(comp).then(c => hydrateIsland(record, c, rest));
      }
      continue;
    }

    const MutationObserverCtor: any =
      typeof (globalThis as any).MutationObserver !== 'undefined' ? (globalThis as any).MutationObserver : null;

    const doHydrate = () => {
      const comp = resolveComponent(record.componentName, components, getComponent);
      if (comp) {
        Promise.resolve(comp).then(c => hydrateIsland(record, c, rest));
      }
    };

    if (record.el.getAttribute('data-hydrating') === 'true' && !record.el.hasAttribute('data-hydrated')) {
      doHydrate();
      continue;
    }

    if (MutationObserverCtor) {
      const observer = new MutationObserverCtor(() => {
        if (record.el.getAttribute('data-hydrating') === 'true' && !record.el.hasAttribute('data-hydrated')) {
          observer.disconnect();
          doHydrate();
        }
      });
      observer.observe(record.el, { attributes: true, attributeFilter: ['data-hydrating'] });
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
  return null;
}
