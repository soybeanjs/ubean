import {
  createApp as _createApp,
  defineComponent,
  h,
  ref,
  reactive,
  provide,
  inject,
  markRaw,
  watchEffect,
  computed,
  nextTick
} from 'vue';
import type { App, Component, ConcreteComponent, PropType } from 'vue';
import type { PageObject } from '../pages/protocol';
import { createUbeanClient, getInitialPageData } from './client';
import { createHeadManager } from './head';
import { resolveRoute, isActiveRoute } from './router-location';
import type { RouteLocation } from './router-location';
import { withViewTransition, supportsViewTransitions } from './view-transitions';
import type { ViewTransitionOptions } from './view-transitions';
import { localizePath } from './i18n';

const PAGE_KEY = Symbol('ubean-page');
const ROUTER_KEY = Symbol('ubean-router');
const HEAD_KEY = Symbol('ubean-head');
const CLIENT_KEY = Symbol('ubean-client');
const TRANSITION_KEY = Symbol('ubean-transition');

export interface UbeanAppOptions {
  resolvePageComponent: (name: string) => Promise<Component>;
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  resolveLayoutParent?: (name: string) => string | null;
  initialPage?: PageObject;
  id?: string;
  head?: ReturnType<typeof createHeadManager>;
  viewTransitions?: boolean | ViewTransitionOptions;
}

export interface UbeanAppInstance {
  app: App;
  client: ReturnType<typeof createUbeanClient>;
  head: ReturnType<typeof createHeadManager>;
  page: Record<string, unknown>;
  navigate: (url: string, opts?: { replace?: boolean; transition?: boolean }) => Promise<void>;
}

function defaultResolveLayoutParent(name: string, defaultLayout: string | null): string | null {
  if (!name || name === defaultLayout) return null;

  const lastSlash = name.lastIndexOf('/');
  if (lastSlash > 0) {
    return name.slice(0, lastSlash);
  }

  return defaultLayout;
}

function renderNestedLayouts(
  pageState: PageObject,
  PageComp: Component,
  layoutChain: { name: string; component: Component }[]
): any {
  const pageVNode = h(PageComp as ConcreteComponent, {
    key: pageState.component + pageState.url,
    ...(pageState.props as any)
  });

  if (layoutChain.length === 0) {
    return pageVNode;
  }

  let vnode: any = pageVNode;
  for (let i = layoutChain.length - 1; i >= 0; i--) {
    const layout = layoutChain[i];
    vnode = h(
      layout.component as ConcreteComponent,
      { page: pageState, layoutName: layout.name },
      { default: () => vnode }
    );
  }
  return vnode;
}

async function resolveLayoutChain(
  layoutName: string | false | null | undefined,
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>,
  resolveParent: (name: string) => string | null
): Promise<{ name: string; component: Component }[]> {
  if (layoutName === false || layoutName == null) return [];

  const chain: { name: string; component: Component }[] = [];
  const visited = new Set<string>();
  let current: string | null = layoutName;

  while (current && !visited.has(current)) {
    visited.add(current);
    const comp = await resolveLayoutComponent(current);
    if (comp) {
      chain.push({ name: current, component: markRaw(comp) });
    }
    current = resolveParent(current);
  }

  return chain;
}

const PageRoot = defineComponent({
  name: 'UbeanPageRoot',
  setup() {
    const ctx = inject(CLIENT_KEY) as any;
    return () => {
      const pageState = ctx.page as PageObject;
      const PageComp = ctx.resolvedPage.value as Component | null;
      const layoutChain = ctx.resolvedLayouts.value as { name: string; component: Component }[];

      if (!PageComp) {
        return h('div', { 'data-ubean-loading': '' });
      }

      return renderNestedLayouts(pageState, PageComp, layoutChain);
    };
  }
});

export const Link = defineComponent({
  name: 'Link',
  props: {
    to: { type: [String, Object] as PropType<RouteLocation>, default: undefined },
    href: { type: String, default: undefined },
    replace: { type: Boolean, default: false },
    prefetch: { type: Boolean, default: false },
    as: { type: String, default: 'a' },
    activeClass: { type: String, default: 'router-link-active' },
    exactActiveClass: { type: String, default: 'router-link-exact-active' },
    noActiveClass: { type: Boolean, default: false }
  },
  setup(props, { slots, attrs }) {
    const router = inject(ROUTER_KEY) as {
      navigate: (url: string, opts?: any) => Promise<void>;
      client: any;
      page?: PageObject;
    };
    const page = inject(PAGE_KEY, null) as PageObject | null;

    const resolvedHref = computed(() => {
      let href = '#';
      if (props.href) href = props.href;
      else if (props.to) href = resolveRoute(props.to);
      const isExternal = href.startsWith('http') || href.startsWith('//') || href.startsWith('#');
      if (isExternal) return href;
      return localizePath(href);
    });

    function onClick(e: any) {
      if (e.defaultPrevented) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
      if (e.target && e.target.closest?.('a')?.hasAttribute('target')) return;

      e.preventDefault();
      router.navigate(resolvedHref.value, { replace: props.replace });
    }

    function onPrefetch() {
      if (props.prefetch && router.client?.prefetch) {
        router.client.prefetch(resolvedHref.value);
      }
    }

    return () => {
      const href = resolvedHref.value;
      const isExternal = href.startsWith('http') || href.startsWith('//');
      const classes: Record<string, boolean> = {};

      if (!props.noActiveClass && page && !isExternal) {
        if (props.exactActiveClass) {
          classes[props.exactActiveClass] = isActiveRoute(page.url, href, true);
        }
        if (props.activeClass) {
          classes[props.activeClass] = isActiveRoute(page.url, href, false);
        }
      }

      return h(
        props.as,
        {
          ...attrs,
          href,
          ...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          onClick: isExternal ? undefined : onClick,
          onMouseenter: isExternal ? undefined : onPrefetch,
          'data-ubean-link': '',
          class:
            Object.keys(classes)
              .filter(c => classes[c])
              .join(' ') || undefined
        },
        slots.default
          ? slots.default({
              isActive: classes[props.activeClass],
              isExactActive: classes[props.exactActiveClass],
              href
            })
          : []
      );
    };
  }
});

export const Head = defineComponent({
  name: 'Head',
  setup() {
    return () => null;
  }
});

export function createUbeanApp(options: UbeanAppOptions & { id?: string }): UbeanAppInstance {
  const client = createUbeanClient();
  const initial =
    options.initialPage ||
    getInitialPageData() ||
    ({
      component: '',
      props: {},
      params: {},
      url: '/'
    } as PageObject);

  const resolveParent =
    options.resolveLayoutParent || ((name: string) => defaultResolveLayoutParent(name, options.defaultLayout || null));

  const transitionOpts: ViewTransitionOptions =
    options.viewTransitions === false
      ? { enabled: false }
      : options.viewTransitions === true || options.viewTransitions == null
        ? { enabled: true }
        : options.viewTransitions;

  const page = reactive<PageObject>({ ...initial }) as any;
  const resolvedPage = ref<Component | null>(null);
  const resolvedLayouts = ref<{ name: string; component: Component }[]>([]);
  const head = options.head || createHeadManager(initial.head);

  const ctx = {
    page,
    resolvedPage,
    resolvedLayouts,
    head,
    client
  };

  async function resolveFor(pageData: PageObject) {
    const layoutName = pageData.layout === false ? false : pageData.layout || options.defaultLayout;
    const [pageComp, layouts] = await Promise.all([
      options.resolvePageComponent(pageData.component),
      resolveLayoutChain(layoutName, options.resolveLayoutComponent, resolveParent)
    ]);
    resolvedPage.value = markRaw(pageComp);
    resolvedLayouts.value = layouts;
    await nextTick();
  }

  async function applyPageData(next: PageObject): Promise<void> {
    Object.assign(page, next);
    if (next.head) head.apply(next.head);
    await resolveFor(next);
  }

  let pendingTransition = false;

  async function navigate(url: string, navOpts: { replace?: boolean; transition?: boolean } = {}) {
    const useTransition = navOpts.transition !== false && transitionOpts.enabled !== false && supportsViewTransitions();

    client.state.navigating = true;
    try {
      const pageData = await client.fetchPage(url);

      if (useTransition) {
        pendingTransition = true;
        await withViewTransition(async () => {
          client.applyPage(pageData, { replace: navOpts.replace, url });
          await applyPageData(pageData);
        }, transitionOpts);
        pendingTransition = false;
      } else {
        client.applyPage(pageData, { replace: navOpts.replace, url });
        await applyPageData(pageData);
      }
    } finally {
      client.state.navigating = false;
    }
  }

  client.subscribe(async () => {
    if (pendingTransition) return;
    const next = client.state.page as PageObject;
    const useTransition = transitionOpts.enabled !== false && supportsViewTransitions();

    if (useTransition) {
      await withViewTransition(async () => {
        await applyPageData(next);
      }, transitionOpts);
    } else {
      await applyPageData(next);
    }
  });

  const RootComponent = defineComponent({
    name: 'UbeanAppRoot',
    setup() {
      provide(CLIENT_KEY, ctx);
      provide(PAGE_KEY, page);
      provide(ROUTER_KEY, { navigate, client });
      provide(HEAD_KEY, head);
      provide(TRANSITION_KEY, transitionOpts);

      resolveFor(initial);

      if (initial.head) {
        watchEffect(() => head.apply((page as any).head || null));
      }

      return () => h(PageRoot);
    }
  });

  const app = _createApp(RootComponent);

  app.config.globalProperties.$ubean = { page, head, navigate, client, viewTransitions: transitionOpts };

  return { app, client, head, page: page as any, navigate };
}

export function createUbeanSSRApp(initialPage: PageObject, options: Omit<UbeanAppOptions, 'initialPage'>): App {
  const resolveParent =
    options.resolveLayoutParent || ((name: string) => defaultResolveLayoutParent(name, options.defaultLayout || null));

  const resolvedPage = ref<Component | null>(null);
  const resolvedLayouts = ref<{ name: string; component: Component }[]>([]);
  const head = options.head || createHeadManager(initialPage.head);
  const page = reactive<PageObject>({ ...initialPage });

  const ctx = {
    page,
    resolvedPage,
    resolvedLayouts,
    head,
    client: null
  };

  const RootComponent = defineComponent({
    name: 'UbeanSSRApp',
    setup() {
      provide(CLIENT_KEY, ctx);
      provide(PAGE_KEY, page);
      provide(ROUTER_KEY, { navigate: async () => {}, client: null });
      provide(HEAD_KEY, head);

      return () => {
        if (!resolvedPage.value) {
          return h('div', { 'data-ubean-loading': '' });
        }
        return renderNestedLayouts(initialPage, resolvedPage.value, resolvedLayouts.value);
      };
    }
  });

  const app = _createApp(RootComponent);

  const layoutName = initialPage.layout === false ? false : initialPage.layout || options.defaultLayout;
  Promise.all([
    options.resolvePageComponent(initialPage.component),
    resolveLayoutChain(layoutName, options.resolveLayoutComponent, resolveParent)
  ]).then(([pc, layouts]) => {
    resolvedPage.value = markRaw(pc);
    resolvedLayouts.value = layouts;
  });

  return app;
}

export function usePage<T = Record<string, unknown>>(): PageObject<T> {
  const p = inject<PageObject<T>>(PAGE_KEY);
  if (!p) throw new Error('[ubean] usePage() must be called inside a ubean Vue app');
  return p;
}

export function useRouter() {
  const r = inject<{
    navigate: (url: string, opts?: { replace?: boolean; transition?: boolean }) => Promise<void>;
    client: any;
  }>(ROUTER_KEY);
  if (!r) throw new Error('[ubean] useRouter() must be called inside a ubean Vue app');
  return r;
}

export function useHead() {
  const h2 = inject<ReturnType<typeof createHeadManager>>(HEAD_KEY);
  if (!h2) throw new Error('[ubean] useHead() must be called inside a ubean Vue app');
  return h2;
}

export function useViewTransition() {
  const opts = inject<ViewTransitionOptions>(TRANSITION_KEY, { enabled: true });
  return {
    enabled: opts.enabled !== false && supportsViewTransitions(),
    supports: supportsViewTransitions(),
    options: opts
  };
}
