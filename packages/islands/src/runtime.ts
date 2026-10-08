import { createApp, h, defineComponent, createCommentVNode, Suspense, ref, onMounted, watch } from 'vue';
import type { Component, App as VueApp, VNode } from 'vue';

interface DomElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  hasAttribute(name: string): boolean;
  innerHTML: string;
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

/**
 * True when the tree still has islands that have not been hydrated.
 * Used by the client entry to skip the second rAF on SPA navigations
 * that did not introduce new islands.
 */
export function hasPendingIslands(root?: DomParentNode | null): boolean {
  return collectIslands(root ?? undefined).some(record => !record.el.hasAttribute('data-hydrated'));
}

export interface IslandHydrationScheduler {
  requestAnimationFrame: (cb: () => void) => unknown;
  hasPending: () => boolean;
  hydrate: () => void;
  /**
   * First mount: always wait two frames so Vue's patch (and async resolve)
   * finishes. SPA `afterEach`: after the first frame, skip the second when
   * nothing is pending — nested Suspense islands that appear only on the
   * second frame are a documented miss; first mount still forces two frames.
   */
  forceDoubleFrame?: boolean;
}

export function scheduleIslandHydration(options: IslandHydrationScheduler): void {
  const raf = options.requestAnimationFrame;
  raf(() => {
    if (!options.forceDoubleFrame && !options.hasPending()) return;
    raf(() => {
      if (!options.hasPending()) return;
      options.hydrate();
    });
  });
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
    if (record.el.hasAttribute('data-hydrated')) continue;

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

/**
 * 把注册表里的 value 归一化成「组件或组件 Promise」。
 *
 * 注册表的 value 有两种合法形态,**而且都是函数**,不能靠 `typeof` 区分:
 *  - 惰性 loader:`() => import('…')` —— 必须**调用**才能拿到组件
 *  - 函数式组件:`(props, ctx) => VNode` —— 必须原样交给 Vue
 *
 * 判据是「调用后的返回值是不是 thenable」。
 *
 * 这修复了一个**静默**错误:`virtual:ubean-islands-registry` 导出的是惰性
 * loader,而此前 `Promise.resolve(loader)` 不会调用 loader —— 它只是把
 * loader 本身当成组件交给 Vue。Vue 于是把 `import()` 的 Promise 渲染成文本
 * 节点 `[object Promise]`,而 `hydrateIsland` 又提前打上
 * `data-hydrated="true"`,最终表现为「水合标记已完成、内容却是
 * `[object Promise]`」——断言 `data-hydrated` 的测试会误判为通过,
 * 只有真正读 DOM 内容的测试才能发现(靠 30s 超时暴露)。
 */
function resolveComponentValue(value: Component | (() => Promise<Component>)): Component | Promise<Component> {
  if (typeof value !== 'function') return unwrapComponentModule(value) as Component;

  // 已是 Vue 组件对象(带 render/setup)或 defineAsyncComponent 产物 —— 原样返回
  const asRecord = value as { render?: unknown; setup?: unknown };
  if (asRecord.render || asRecord.setup) return value;

  try {
    const maybe = unwrapComponentModule((value as () => unknown)());
    // 形态 1:惰性 loader 返回 Promise(`() => import('…')`,注册表的真实形态)
    if (maybe && typeof (maybe as Promise<Component>).then === 'function') {
      return (maybe as Promise<unknown>).then(unwrapped => unwrapComponentModule(unwrapped) as Component);
    }
    // 形态 2:同步返回组件对象的 loader(`() => Foo`)
    if (looksLikeComponent(maybe)) return maybe as Component;
  } catch {
    // 函数式组件在 props 为 undefined 时可能抛错 —— 说明它不是 loader
  }

  // 形态 3:它本来就是函数式组件 —— 调用结果不是组件(可能是 VNode/字符串),
  // 必须把**原函数**交给 Vue,而不是这次试探性调用的返回值
  return value as Component;
}

/**
 * 判断一次试探性调用的返回值「像不像组件」。
 *
 * 关键是排除 VNode:函数式组件 `(props, ctx) => VNode` 被以 `undefined` props
 * 调用时返回的正是 VNode,若把它当成组件返回,就会把渲染结果当组件二次挂载。
 * Vue 的 VNode 带 `__v_isVNode` 标记,用它做否定判据。
 */
function looksLikeComponent(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.__v_isVNode) return false;
  return 'render' in record || 'setup' in record || '__name' in record || 'template' in record;
}

/**
 * 拆掉 ESM 模块命名空间,取出 `default` 导出。
 *
 * 惰性 loader 的真实形态是 `() => import('/src/components/X.vue')`,它 resolve 的
 * **不是组件本身**,而是模块命名空间 `{ default: Component }`。若把命名空间当组件
 * 交给 Vue,会得到 `[Vue warn] Component is missing template or render function: Module`
 * —— 内容依然是空的。这里统一在「调用后」和「Promise resolve 后」两处拆包。
 *
 * 只认带 `default` 且**没有** `__esModule` 标记之外其它组件特征的普通对象,
 * 避免误拆 `defineAsyncComponent` 之类的合法组件对象。
 */
function unwrapComponentModule(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  // 本身就是组件对象 / VNode —— 不拆
  if (record.__v_isVNode || record.render || record.setup || record.template) return value;
  // 只有模块命名空间才有 `default`;SFC 编译产物正是 `{ default: Component }`
  if (!('default' in record)) return value;
  const inner = record.default;
  return looksLikeComponent(inner) ? inner : value;
}

function resolveComponent(
  name: string,
  components: Record<string, Component | (() => Promise<Component>)>,
  getComponent?: (name: string) => Component | Promise<Component> | null
): Component | Promise<Component> | null {
  if (components[name]) return resolveComponentValue(components[name]);
  if (getComponent) {
    const resolved = getComponent(name);
    return resolved ? resolveComponentValue(resolved as Component | (() => Promise<Component>)) : null;
  }

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
/* Server Islands (P9-04 + Task 9.4): defineServerIsland                       */
/* -------------------------------------------------------------------------- */

/**
 * `POST /__server-component` 端点 — 接收 `{ path, props }`,在服务端用注册表中的
 * 组件重新渲染并返回 HTML 片段。由 `createServerComponentMiddleware()` 处理。
 */
export const SERVER_COMPONENT_ENDPOINT = '/__server-component';

/**
 * 全局服务端组件注册表:组件绝对路径 → Vue 组件对象。
 *
 * SSR 构建中,`defineServerIsland(Comp, { rerenderOnPropsChange: true }, '/abs/path')`
 * 会调用 `registerServerComponent(path, Comp)` 将真实组件注册到此处。
 * 客户端构建中 `Comp` 是 stub,不会注册。
 *
 * 中间件 `createServerComponentMiddleware()` 通过 `getServerComponent(path)` 取出
 * 组件,用 `renderToString(h(Comp, props))` 重新渲染并返回 HTML。
 *
 * **真·进程单例(挂在 `globalThis` 上)** —— 不能用模块级 `Map`:dev 的 SSR 图会把本文件
 * 内联进 Vite 预构建 chunk(实测 `form-action-*.js`),而 `createUbeanApp()` 由 `@ubean/app`
 * 的产物静态 `import '@ubean/islands/server'` 走 Node 原生解析取到**另一份** `dist/runtime.js`。
 * 模块级状态只在同一个模块实例内共享,于是「SSR 渲染时注册」与「`POST /__server-component`
 * 查找」读的是两个 Map,表现为该端点恒 404 `Component not registered for path`。
 *
 * 同类先例:`@ubean/vue` 的 matcher 注册表(`packages/vue/src/matchers.ts`)与
 * `@ubean/build` 的模块注册表都出于同一理由挂在 `globalThis` 上(AGENTS.md §8 #19)。
 */
const SERVER_COMPONENT_REGISTRY_KEY = '__ubean_server_component_registry__';

function getServerComponentRegistry(): Map<string, Component> {
  const store = globalThis as unknown as Record<string, unknown>;
  const existing = store[SERVER_COMPONENT_REGISTRY_KEY];
  if (existing instanceof Map) return existing as Map<string, Component>;
  const created = new Map<string, Component>();
  store[SERVER_COMPONENT_REGISTRY_KEY] = created;
  return created;
}

/**
 * 注册服务端组件到全局注册表 (SSR 构建中由 `defineServerIsland` 自动调用)。
 *
 * 同名重复注册会覆盖 —— HMR 重新求值页面模块时因此能拿到最新组件引用。
 */
export function registerServerComponent(path: string, component: Component): void {
  getServerComponentRegistry().set(path, component);
}

/**
 * 从全局注册表取出服务端组件 (由 `createServerComponentMiddleware` 调用)。
 * 未注册时返回 `undefined`。
 */
export function getServerComponent(path: string): Component | undefined {
  return getServerComponentRegistry().get(path);
}

/** 清空注册表 (仅用于测试)。 */
export function _clearServerComponentRegistry(): void {
  getServerComponentRegistry().clear();
}

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
  /**
   * Task 9.4: 是否在 props 变化时重新请求服务端组件 HTML 并替换 DOM。
   *
   * - `false` (默认): 仅 SSR 渲染一次,客户端水合后不再请求服务端。
   * - `true`: 客户端 `onMounted` 后立即请求一次,并 `watch` props 变化重新请求,
   *   用返回的 HTML 替换容器 `innerHTML`。SSR 端会将组件注册到全局注册表供中间件查找。
   *
   * 需配合 Vite 插件自动注入的第 3 参数 (组件绝对路径) 使用。当 `true` 但未提供
   * 路径时 (例如手动调用未走 Vite 插件),退化为 `false` 行为。
   */
  rerenderOnPropsChange?: boolean;
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
 * ## Task 9.4: Props 重渲染
 *
 * 当 `options.rerenderOnPropsChange: true` 且 Vite 插件注入了组件路径 (第 3 参数):
 *
 * - **SSR**: `defineServerIsland` 将组件注册到全局注册表 (`registerServerComponent`),
 *   供 `POST /__server-component` 中间件查找。SSR 渲染输出与不带此选项时一致。
 * - **客户端**: 包装组件外层渲染 `<ubean-server-island>` 容器 (带 ref),内部仍是
 *   `<Suspense><Component /></Suspense>` (client 构建中 `Component` 是 stub)。
 *   `onMounted` 后立即 `POST {path, props}` 到 `/__server-component`,用返回的 HTML
 *   替换容器 `innerHTML`;`watch(attrs)` 在 props 变化时重复此流程。
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
 *
 * // 4. Task 9.4: props 变化时重渲染 (Vite 插件会自动注入第 3 参数)
 * const DashboardIsland = defineServerIsland(Dashboard, {
 *   rerenderOnPropsChange: true
 * });
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
 *
 * @param Component 服务端组件 (通常是 `.server.vue` 导入)
 * @param options 选项
 * @param __serverComponentPath 组件绝对路径 (由 Vite 插件自动注入,勿手动传)
 */
export function defineServerIsland(
  Component: Component,
  options?: ServerIslandOptions,
  __serverComponentPath?: string
): Component {
  const fallback = options?.fallback;
  const rerenderOnPropsChange = options?.rerenderOnPropsChange === true && !!__serverComponentPath;

  // SSR 端: 注册组件到全局注册表,供中间件按路径查找并重新渲染。
  // 客户端构建中 Component 是 stub,不应注册 (typeof window !== 'undefined' 守卫)。
  if (rerenderOnPropsChange && typeof window === 'undefined' && __serverComponentPath) {
    registerServerComponent(__serverComponentPath, Component);
  }

  return defineComponent({
    name: 'ServerIsland',
    inheritAttrs: false,
    setup(_, { slots, attrs }) {
      // Task 9.4: 启用 rerenderOnPropsChange 时,用 <ubean-server-island> 容器包裹,
      // 客户端 onMounted 后 fetch HTML 并替换 innerHTML,watch props 重新 fetch。
      if (rerenderOnPropsChange) {
        const containerRef = ref<DomElement | null>(null);

        const fetchAndReplace = async () => {
          const el = containerRef.value;
          if (!el) return;
          try {
            const res = await _fetchServerComponent(__serverComponentPath!, { ...attrs });
            if (res.ok) {
              el.innerHTML = await res.text();
            }
          } catch {
            // 静默失败,保留上次内容 (或 stub 的空内容)
          }
        };

        onMounted(() => {
          // 立即 fetch 一次以填充 stub 占位 (客户端构建中 Component 是 stub)
          void fetchAndReplace();
          // watch attrs 变化重新 fetch (deep 以捕获嵌套对象引用变化)
          watch(() => ({ ...attrs }), fetchAndReplace, { deep: true });
        });

        return () =>
          h('ubean-server-island', { ref: containerRef }, [
            h(Suspense, null, {
              default: () => h(Component, attrs, slots),
              fallback:
                typeof fallback === 'string'
                  ? () => fallback
                  : fallback
                    ? () => h(fallback)
                    : () => h('ubean-defer-fallback')
            })
          ]);
      }

      // 默认行为: 不带容器,直接 Suspense 包裹 (与 Task 9.4 之前一致)
      return () =>
        h(Suspense, null, {
          default: () => h(Component, attrs, slots),
          fallback:
            typeof fallback === 'string'
              ? () => fallback
              : fallback
                ? () => h(fallback)
                : () => h('ubean-defer-fallback')
        });
    }
  });
}

/**
 * 内部: POST 到 `/__server-component` 获取重新渲染的 HTML 片段。
 *
 * 抽出为独立函数便于测试时 mock。使用全局 `fetch`。
 */
async function _fetchServerComponent(
  path: string,
  props: Record<string, unknown>
): Promise<{ ok: boolean; text: () => Promise<string> }> {
  const res = await (globalThis as { fetch: typeof fetch }).fetch(SERVER_COMPONENT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, props })
  });
  return { ok: res.ok, text: () => res.text() };
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
export function defineIsland(Component: Component, strategy: IslandStrategy, options?: IslandOptions): Component {
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
          strategy === 'only' ? undefined : h(Component, mergedProps, slots)
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

/* -------------------------------------------------------------------------- */
/* Server Components (Task 9.1 / 9.2): .server.vue / .client.vue runtime       */
/* -------------------------------------------------------------------------- */

/**
 * `.server.vue` 组件在客户端 bundle 中的占位 stub (Task 9.1)。
 *
 * Vite 插件在 client 构建中将 `.server.vue` 的 import 重定向到虚拟 stub 模块,
 * 该模块导出此组件。组件渲染一个空的 `<ubean-server-only>` 元素 —— SSR 已在
 * 该元素内部渲染了完整 HTML,客户端 Vue 水合时匹配该元素但不触碰其子节点
 * (SSR 模板通过 `v-once` 标记为静态内容),从而保留服务端渲染的 HTML 不被清除。
 *
 * 这保证了 `.server.vue` 组件的 JS 不会发送到客户端 —— 客户端只导入此 stub。
 */
export const ServerComponentStub = defineComponent({
  name: 'ServerComponentStub',
  setup() {
    return () => h('ubean-server-only', { 'data-server-only': '' });
  }
});

/**
 * `.client.vue` 的占位符 vnode —— SSR 与客户端水合首帧共用同一形态。
 *
 * **是注释节点，不是元素**（这与 `@ubean/vue` 的 `<ClientOnly>` 一致，标记文本也相同）。
 * 元素占位符（早先是 `<div data-client-only>`）在受限的父级里会产出**非法嵌套**：放进
 * `<tr>` / `<table>` / `<ul>` / `<select>` 时会被 HTML 解析器提到容器外（表格里的 `<div>`
 * 会被 foster-parent 到表格之前），DOM 与客户端 vnode 树随即错位 → 水合 mismatch；放进
 * `<p>` 也会被自动闭合。注释在任何位置都合法、不占布局，因此没有这类上下文依赖。
 *
 * 代价是不能再对它写 CSS（`[data-client-only]` 选择器失效）。需要占位内容/撑高度时用
 * `<ClientOnly>` 的 `#fallback` 插槽 —— 那是显式的、由使用者决定的占位内容。
 */
function clientOnlyPlaceholder(): VNode {
  return createCommentVNode('client-only');
}

/**
 * `.client.vue` 组件在 SSR 构建中的通用占位符 (Task 9.2)。
 *
 * Vite 插件在 SSR 构建中将 `.client.vue` 的 import 重定向到虚拟模块,
 * 该模块导出此组件。组件渲染 {@link clientOnlyPlaceholder}（`<!--client-only-->`）,
 * 与客户端 `defineClientComponent` 初始渲染输出一致,确保水合无 mismatch。
 *
 * SSR 使用通用占位符(而非真实组件)避免了在服务端导入可能含浏览器 API
 * 的 `.client.vue` 组件代码。
 */
export const ClientComponentPlaceholder = defineComponent({
  name: 'ClientComponentPlaceholder',
  setup() {
    return () => clientOnlyPlaceholder();
  }
});

/**
 * 定义客户端组件 —— `.client.vue` 在客户端构建中的包装器 (Task 9.2)。
 *
 * Vite 插件在 client 构建中为每个 `.client.vue` 生成虚拟包装模块:
 * ```ts
 * import RealComp from '/abs/path/Foo.client.vue';
 * import { defineClientComponent } from '@ubean/islands/runtime';
 * export default defineClientComponent(RealComp);
 * ```
 *
 * ## 工作机制
 *
 * - **SSR**: 由 `ClientComponentPlaceholder` 替代,渲染 `<!--client-only-->` 注释占位符
 * - **客户端初始渲染**: `isClient` 为 false,渲染同一个注释占位符,与 SSR 输出匹配,水合无 mismatch
 * - **客户端 `onMounted` 后**: `isClient` 变为 true,渲染真实组件,Vue 自动 patch 替换占位符
 *
 * 这种模式确保 `.client.vue` 组件只在客户端渲染,SSR 仅输出占位符,
 * 且不依赖 islands 注册表 / `hydrateIslands()` 机制。
 *
 * ## 用法
 *
 * 通常由 Vite 插件自动生成包装模块,用户无需手动调用。如需编程式使用:
 *
 * ```ts
 * import { defineClientComponent } from '@ubean/islands/runtime';
 * import Widget from './Widget.client.vue';
 * const WidgetClient = defineClientComponent(Widget);
 * ```
 */
export function defineClientComponent(component: Component): Component {
  return defineComponent({
    name: 'ClientComponent',
    inheritAttrs: false,
    setup(_, { slots, attrs }) {
      // isClient: SSR 与客户端初始渲染时均为 false,确保输出与 SSR 占位符一致。
      // onMounted 仅在客户端执行,触发后 isClient 变为 true,重新渲染真实组件。
      const isClient = ref(false);
      onMounted(() => {
        isClient.value = true;
      });
      return () => (isClient.value ? h(component, attrs, slots) : clientOnlyPlaceholder());
    }
  });
}

/**
 * 定义配对组件 — `Foo.vue` 同时存在 `.server.vue` + `.client.vue` 兄弟文件时,
 * Vite 插件生成的虚拟包装模块调用此函数 (Task 9.3)。
 *
 * ## 工作机制
 *
 * - **SSR**: 配对 wrapper 模块直接 re-export `.server.vue`,根本不会调用本函数
 *   (见 `vite.ts` `load` 钩子 SSR 分支)。SSR 渲染真实服务端组件内容。
 * - **客户端初始渲染**: `isClient` 为 false,渲染 `ServerComp` —— 但在客户端构建中
 *   `.server.vue` 已被重定向到 `ServerComponentStub`(渲染空的
 *   `<ubean-server-only>` 元素),与 SSR 输出的 `<ubean-server-only v-once>真实内容
 *   </ubean-server-only>` 标签匹配,Vue 水合时元素标签一致 (内部子节点因 `v-once`
 *   标记为静态而被保留,虽有 mismatch 但 Vue 通常能容忍)。
 * - **客户端 `onMounted` 后**: `isClient` 变为 true,渲染 `ClientComp` (真实客户端
 *   组件),Vue 自动 patch 替换 stub 内容。
 *
 * ## 局限性
 *
 * SSR 渲染的 HTML 在客户端水合时不会被完美保留 —— Vue 会尝试 patch stub 的空
 * `<ubean-server-only>` 与 SSR 输出的有内容版本,可能导致 SSR 内容被清除后再渲染
 * 客户端组件。这是已知的折中 (与 React Server Components 的 hydration 流程类似)。
 *
 * 通常由 Vite 插件自动生成包装模块,用户无需手动调用。如需编程式使用:
 *
 * ```ts
 * import { definePairedComponent } from '@ubean/islands/runtime';
 * import ServerComp from './Foo.server.vue';
 * import ClientComp from './Foo.client.vue';
 * const Foo = definePairedComponent(ServerComp, ClientComp);
 * ```
 */
export function definePairedComponent(ServerComp: Component, ClientComp: Component): Component {
  return defineComponent({
    name: 'PairedComponent',
    inheritAttrs: false,
    setup(_, { slots, attrs }) {
      // isClient: SSR 与客户端初始渲染时均为 false,渲染 ServerComp (客户端构建中
      // 是 stub,与 SSR 输出的 <ubean-server-only> 标签匹配)。
      // onMounted 仅在客户端执行,触发后切换为 ClientComp。
      const isClient = ref(false);
      onMounted(() => {
        isClient.value = true;
      });
      return () => (isClient.value ? h(ClientComp, attrs, slots) : h(ServerComp, attrs, slots));
    }
  });
}
