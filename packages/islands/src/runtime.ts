import { createApp, h, defineComponent, Suspense } from 'vue';
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
        Promise.resolve(comp).then(c => hydrateIsland(record, c, rest));
      }
      continue;
    }

    const doHydrate = () => {
      const comp = resolveComponent(record.componentName, components, getComponent);
      if (comp) {
        Promise.resolve(comp).then(c => hydrateIsland(record, c, rest));
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

/* -------------------------------------------------------------------------- */
/* Server Islands (P9-04): defineServerIsland                                  */
/* -------------------------------------------------------------------------- */

/**
 * `defineServerIsland` 的选项。
 */
export interface ServerIslandOptions {
  /**
   * Suspense fallback 内容。
   *
   * - 字符串:作为静态文本渲染(适合简单 loading 提示)
   * - Vue 组件:作为 fallback slot 渲染(可包含动态内容)
   * - 未提供:渲染空 `<ubean-defer-fallback>` 占位元素(与 PPR 静态壳默认行为一致)
   *
   * 在 PPR 模式下,预渲染(SSG)阶段仅渲染 fallback(生成静态壳);
   * 流式 SSR 阶段 fallback 先输出,异步组件解析后通过 Suspense 边界流式输出。
   */
  fallback?: Component | string;
}

/**
 * 定义服务端 island — 将异步组件包裹在 `<Suspense>` 边界中,实现 Partial
 * Prerendering / Server Islands 模式。
 *
 * 替代旧版 `server:defer` 编译时指令。对齐 Next.js 16 PPR / Astro 5
 * `server:defer` 语义。
 *
 * ## 工作机制
 *
 * - **预渲染(SSG)阶段**:仅渲染 fallback(生成静态壳)
 * - **流式 SSR 阶段**:fallback 先输出,异步组件解析后通过 Suspense 边界流式输出
 * - **客户端**:Suspense 边界保持,异步组件解析后自动替换 fallback
 *
 * 传入的 `Component` 必须是异步的(`async setup()` 或 `defineAsyncComponent`)
 * 才能触发 Suspense 流式行为;同步组件会立即解析,Suspense 退化为透明包装。
 *
 * ## Props/Slots 透传
 *
 * 包装组件设置 `inheritAttrs: false`,将所有 attrs(含 props)和 slots
 * 透传给内部 `Component`,使用方式与直接渲染 `Component` 一致:
 *
 * ```vue
 * <DashboardIsland :userId="123" #header="slotProps">...</DashboardIsland>
 * ```
 *
 * 等价于:
 *
 * ```vue
 * <Suspense>
 *   <template #fallback><!-- fallback 内容 --></template>
 *   <Dashboard :userId="123" #header="slotProps">...</Dashboard>
 * </Suspense>
 * ```
 *
 * ## 用法示例
 *
 * ```ts
 * import { defineServerIsland, h } from 'ubean';
 * import Dashboard from './Dashboard.vue';
 *
 * // 1. 字符串 fallback
 * const DashboardIsland = defineServerIsland(Dashboard, {
 *   fallback: 'Loading dashboard...'
 * });
 *
 * // 2. 组件 fallback
 * const DashboardIsland = defineServerIsland(Dashboard, {
 *   fallback: () => h('div', { class: 'spinner' }, 'Loading...')
 * });
 *
 * // 3. 默认占位(fallback 未提供时渲染 <ubean-defer-fallback/>)
 * const DashboardIsland = defineServerIsland(Dashboard);
 * ```
 *
 * 在 SFC 中使用包装后的组件:
 *
 * ```vue
 * <script setup>
 * import { defineServerIsland } from 'ubean';
 * import Dashboard from './Dashboard.vue';
 * const DashboardIsland = defineServerIsland(Dashboard, {
 *   fallback: 'Loading...'
 * });
 * </script>
 *
 * <template>
 *   <DashboardIsland :userId="123" />
 * </template>
 * ```
 */
export function defineServerIsland(Component: Component, options?: ServerIslandOptions): Component {
  const fallback = options?.fallback;
  return defineComponent({
    name: 'ServerIsland',
    inheritAttrs: false,
    setup(_, { slots, attrs }) {
      return () =>
        h(
          Suspense,
          null,
          {
            default: () => h(Component, attrs, slots),
            fallback:
              typeof fallback === 'string'
                ? () => fallback
                : fallback
                  ? () => h(fallback)
                  : () => h('ubean-defer-fallback')
          }
        );
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Client Islands (Phase 4): defineIsland — runtime alternative to v-client.*  */
/* -------------------------------------------------------------------------- */

/**
 * 客户端 island 水合策略(与 `v-client.*` 的 modifier 一一对应)。
 */
export type IslandStrategy = 'load' | 'idle' | 'visible' | 'media' | 'only';

/**
 * `defineIsland` 的选项。
 */
export interface IslandOptions {
  /**
   * 媒体查询字符串(仅 `strategy: 'media'` 时使用)。
   *
   * 与 `v-client.media="'(max-width: 768px)'"` 中的字符串值等价。
   */
  mediaQuery?: string;
  /**
   * 静态 props,在 SSR 阶段序列化到 `<ubean-island data-props="...">`。
   *
   * 未提供时,所有 attrs 都会作为 props 透传给内部组件。
   * (与 `v-client.*` 在模板上接收 attrs 的行为一致。)
   */
  props?: Record<string, unknown>;
}

/**
 * 定义客户端 island — 将组件包装为延迟水合的 island。
 *
 * 这是 `v-client.*` Vue 指令的运行时替代方案,适用于编程式场景
 * (如动态构造 island、在 `.ts` 文件中定义 island、或需要参数化的场景)。
 *
 * **注意**:模板中的 `v-client.*` 指令语法仍然有效,由 Vite 插件
 * (`ubean:islands`)在编译时转换为 `<ubean-island>` 占位元素;
 * `defineIsland` 仅为运行时编程式使用提供,不会替代 Vite 插件的转换逻辑。
 *
 * ## 工作机制
 *
 * - **SSR 阶段**:渲染 `<ubean-island>` 占位元素,包含 `data-island-id`、
 *   `data-component`、`data-directive`、`data-props`、`data-media` 属性
 *   (与 `v-client.*` 转换后的输出格式完全一致)。
 * - **客户端**:由 `hydrateIslands()` 根据 `data-directive` 选择水合策略
 *   (load/idle/visible/media/only),在合适时机挂载组件。
 *
 * ## 用法示例
 *
 * ```ts
 * import { defineIsland } from 'ubean';
 * import Counter from './Counter.vue';
 *
 * // 1. 立即水合(等价于 v-client.load)
 * const CounterIsland = defineIsland(Counter, 'load');
 *
 * // 2. 空闲时水合(等价于 v-client.idle)
 * const HeavyChartIsland = defineIsland(HeavyChart, 'idle');
 *
 * // 3. 进入视口时水合(等价于 v-client.visible)
 * const LazyMapIsland = defineIsland(LazyMap, 'visible');
 *
 * // 4. 媒体查询匹配时水合(等价于 v-client.media)
 * const MobileNavIsland = defineIsland(MobileNav, 'media', {
 *   mediaQuery: '(max-width: 768px)'
 * });
 *
 * // 5. 仅客户端渲染(等价于 v-client.only)
 * const ClientOnlyWidgetIsland = defineIsland(ClientOnlyWidget, 'only');
 * ```
 *
 * 在 SFC 中使用包装后的组件:
 *
 * ```vue
 * <script setup>
 * import { defineIsland } from 'ubean';
 * import Counter from './Counter.vue';
 * const CounterIsland = defineIsland(Counter, 'load');
 * </script>
 *
 * <template>
 *   <CounterIsland :count="5" />
 * </template>
 * ```
 */
export function defineIsland(
  Component: Component,
  strategy: IslandStrategy,
  options?: IslandOptions
): Component {
  const mediaQuery = options?.mediaQuery;
  const staticProps = options?.props;
  // 内部使用 legacy directive 字符串(`client:load` 等),与 Vite 插件转换
  // `<ubean-island data-directive="...">` 的格式保持一致,以便 `hydrateIslands()`
  // 用同一套逻辑处理两种来源的 island。
  const directive = `client:${strategy}` as ClientDirective;

  return defineComponent({
    name: 'ClientIsland',
    inheritAttrs: false,
    setup(_, { slots, attrs }) {
      // 合并静态 props 与 attrs(attrs 优先级更高,允许调用方覆盖)
      const mergedProps = { ...staticProps, ...attrs };
      return () =>
        h(
          'ubean-island',
          {
            'data-island-id': `island-runtime-${strategy}`,
            'data-component': (Component as any)?.name ?? 'AnonymousIsland',
            'data-directive': directive,
            ...(mediaQuery ? { 'data-media': mediaQuery } : {}),
            'data-props': escapeIslandProps(mergedProps)
          },
          // 在 SSR 阶段,内部组件作为子节点渲染输出(等价于 Vite 插件
          // 转换后 `<ubean-island>` 标签内保留的 innerHTML)。
          // client:only 场景下不渲染内部组件(与 Vite 插件对 client:only
          // 的处理一致 —— SSR 输出空占位)。
          strategy === 'only' ? null : h(Component, mergedProps, slots)
        );
    }
  });
}

/** 序列化 props 为 data-props 属性值(与 vite.ts escapeAttr 等价)。 */
function escapeIslandProps(props: Record<string, unknown>): string {
  const json = JSON.stringify(props);
  return json.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// 本地声明的 ClientDirective 类型(与 vite.ts 的 ClientDirective 等价,
// 避免循环依赖,不直接 import)。仅在 defineIsland 内部用于类型断言。
type ClientDirective = 'client:load' | 'client:idle' | 'client:visible' | 'client:media' | 'client:only';
