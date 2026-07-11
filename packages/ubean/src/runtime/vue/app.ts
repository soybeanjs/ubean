import { createApp as _createApp, defineComponent, h, ref, reactive, provide, inject, markRaw, watchEffect } from 'vue';
import type { App, Component, ConcreteComponent } from 'vue';
import type { PageObject } from '../pages/protocol';
import { createUbeanClient, getInitialPageData } from './client';
import { createHeadManager } from './head';

const PAGE_KEY = Symbol('ubean-page');
const ROUTER_KEY = Symbol('ubean-router');
const HEAD_KEY = Symbol('ubean-head');
const CLIENT_KEY = Symbol('ubean-client');

export interface UbeanAppOptions {
  resolvePageComponent: (name: string) => Promise<Component>;
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  initialPage?: PageObject;
  id?: string;
  head?: ReturnType<typeof createHeadManager>;
}

export interface UbeanAppInstance {
  app: App;
  client: ReturnType<typeof createUbeanClient>;
  head: ReturnType<typeof createHeadManager>;
  page: Record<string, unknown>;
  navigate: (url: string, opts?: { replace?: boolean }) => Promise<void>;
}

const PageRoot = defineComponent({
  name: 'UbeanPageRoot',
  setup() {
    const ctx = inject(CLIENT_KEY) as any;
    return () => {
      const pageState = ctx.page as PageObject;
      const PageComp = ctx.resolvedPage.value as Component | null;
      const LayoutComp = ctx.resolvedLayout.value as Component | null;

      if (!PageComp) {
        return h('div', { 'data-ubean-loading': '' });
      }

      const pageVNode = h(PageComp, {
        key: pageState.component + pageState.url,
        ...(pageState.props as any)
      });

      if (LayoutComp) {
        return h(LayoutComp as ConcreteComponent, { page: pageState }, { default: () => pageVNode });
      }
      return pageVNode;
    };
  }
});

export const Link = defineComponent({
  name: 'Link',
  props: {
    href: { type: String, required: true },
    replace: { type: Boolean, default: false },
    prefetch: { type: Boolean, default: false },
    as: { type: String, default: 'a' }
  },
  setup(props, { slots, attrs }) {
    const router = inject(ROUTER_KEY) as { navigate: (url: string, opts?: any) => Promise<void>; client: any };

    function onClick(e: any) {
      if (e.defaultPrevented) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
      if (e.target && e.target.closest?.('a')?.hasAttribute('target')) return;

      e.preventDefault();
      router.navigate(props.href, { replace: props.replace });
    }

    function onPrefetch() {
      if (props.prefetch && router.client?.prefetch) {
        router.client.prefetch(props.href);
      }
    }

    return () =>
      h(
        props.as,
        { ...attrs, href: props.href, onClick, onMouseenter: onPrefetch, 'data-ubean-link': '' },
        slots.default ? slots.default() : []
      );
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

  const page = reactive<PageObject>({ ...initial }) as any;
  const resolvedPage = ref<Component | null>(null);
  const resolvedLayout = ref<Component | null>(null);
  const head = options.head || createHeadManager(initial.head);

  const ctx = {
    page,
    resolvedPage,
    resolvedLayout,
    head,
    client
  };

  async function resolveFor(pageData: PageObject) {
    const layoutName = pageData.layout === false ? false : pageData.layout || options.defaultLayout;
    const [pageComp, layoutComp] = await Promise.all([
      options.resolvePageComponent(pageData.component),
      options.resolveLayoutComponent(layoutName)
    ]);
    resolvedPage.value = markRaw(pageComp);
    resolvedLayout.value = layoutComp ? markRaw(layoutComp) : null;
  }

  async function navigate(url: string, navOpts: { replace?: boolean } = {}) {
    await client.navigate(url, navOpts);
    const next = client.state.page as PageObject;
    Object.assign(page, next);
    if (next.head) head.apply(next.head);
    await resolveFor(next);
  }

  client.subscribe(async () => {
    const next = client.state.page as PageObject;
    Object.assign(page, next);
    if (next.head) head.apply(next.head);
    await resolveFor(next);
  });

  const RootComponent = defineComponent({
    name: 'UbeanAppRoot',
    setup() {
      provide(CLIENT_KEY, ctx);
      provide(PAGE_KEY, page);
      provide(ROUTER_KEY, { navigate, client });
      provide(HEAD_KEY, head);

      resolveFor(initial);

      if (initial.head) {
        watchEffect(() => head.apply((page as any).head || null));
      }

      return () => h(PageRoot);
    }
  });

  const app = _createApp(RootComponent);

  app.config.globalProperties.$ubean = { page, head, navigate, client };

  return { app, client, head, page: page as any, navigate };
}

export function createUbeanSSRApp(initialPage: PageObject, options: Omit<UbeanAppOptions, 'initialPage'>): App {
  const resolvedPage = ref<Component | null>(null);
  const resolvedLayout = ref<Component | null>(null);
  const head = options.head || createHeadManager(initialPage.head);
  const page = reactive<PageObject>({ ...initialPage });

  const ctx = {
    page,
    resolvedPage,
    resolvedLayout,
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
        const pageVNode = h(resolvedPage.value, {
          ...(initialPage.props as any)
        });
        if (resolvedLayout.value) {
          return h(resolvedLayout.value as ConcreteComponent, { page: initialPage }, { default: () => pageVNode });
        }
        return pageVNode;
      };
    }
  });

  const app = _createApp(RootComponent);

  const layoutName = initialPage.layout === false ? false : initialPage.layout || options.defaultLayout;
  Promise.all([options.resolvePageComponent(initialPage.component), options.resolveLayoutComponent(layoutName)]).then(
    ([pc, lc]) => {
      resolvedPage.value = markRaw(pc);
      resolvedLayout.value = lc ? markRaw(lc) : null;
    }
  );

  return app;
}

export function usePage<T = Record<string, unknown>>(): PageObject<T> {
  const p = inject<PageObject<T>>(PAGE_KEY);
  if (!p) throw new Error('[ubean] usePage() must be called inside a ubean Vue app');
  return p;
}

export function useRouter() {
  const r = inject<{ navigate: (url: string, opts?: { replace?: boolean }) => Promise<void>; client: any }>(ROUTER_KEY);
  if (!r) throw new Error('[ubean] useRouter() must be called inside a ubean Vue app');
  return r;
}

export function useHead() {
  const h2 = inject<ReturnType<typeof createHeadManager>>(HEAD_KEY);
  if (!h2) throw new Error('[ubean] useHead() must be called inside a ubean Vue app');
  return h2;
}
