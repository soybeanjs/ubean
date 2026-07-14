import {
  createApp as _createApp,
  createSSRApp as _createSSRApp,
  defineComponent,
  h,
  ref,
  reactive,
  provide,
  inject,
  markRaw,
  watchEffect,
  computed,
  shallowRef
} from 'vue';
import type { App, Component, ConcreteComponent, PropType } from 'vue';
import { RouterView, RouterLink, useRoute, useRouter as useVueRouter } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import type { PageObject, PageHead } from '../pages/protocol';
import { localizePath } from './i18n';
import { createUbeanRouter } from './router';
import { createHeadManager } from './head';
import { supportsViewTransitions } from './view-transitions';
import type { ViewTransitionOptions } from './view-transitions';

const PAGE_KEY = Symbol('ubean-page');
const HEAD_KEY = Symbol('ubean-head');
const TRANSITION_KEY = Symbol('ubean-transition');

export interface UbeanAppOptions {
  routes: RouteRecordRaw[];
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  initialPage?: PageObject;
  head?: ReturnType<typeof createHeadManager>;
  viewTransitions?: boolean | ViewTransitionOptions;
}

export interface UbeanAppInstance {
  app: App;
  router: ReturnType<typeof createUbeanRouter>;
  head: ReturnType<typeof createHeadManager>;
  page: Record<string, unknown>;
}

// --- Layout wrapper component ---
// Reads route.meta.layout and wraps RouterView content with the layout component.
function createLayoutWrapper(
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>,
  defaultLayout: string | null
) {
  const layoutCache = new Map<string, Component | null>();
  const layoutComp = shallowRef<Component | null>(null);
  const currentLayoutName = ref<string | false | null>(null);

  async function loadLayout(name: string | false | null | undefined) {
    const resolved = name === undefined ? defaultLayout : name;
    if (resolved === false || resolved == null) {
      layoutComp.value = null;
      return;
    }
    if (layoutCache.has(resolved)) {
      layoutComp.value = layoutCache.get(resolved) || null;
      return;
    }
    const comp = await resolveLayoutComponent(resolved);
    if (comp) {
      const raw = markRaw(comp);
      layoutCache.set(resolved, raw);
      layoutComp.value = raw;
    } else {
      layoutCache.set(resolved, null);
      layoutComp.value = null;
    }
  }

  return defineComponent({
    name: 'UbeanLayoutView',
    setup() {
      const route = useRoute();

      watchEffect(() => {
        const layoutName = route.meta.layout as string | false | undefined;
        if (layoutName !== currentLayoutName.value) {
          currentLayoutName.value = layoutName === undefined ? defaultLayout : layoutName;
          loadLayout(currentLayoutName.value);
        }
      });

      return () => {
        return h(RouterView, null, {
          default: ({ Component: ViewComponent }: { Component: Component | null }) => {
            if (!ViewComponent) return null;
            if (!layoutComp.value) return h(ViewComponent as ConcreteComponent);
            return h(
              layoutComp.value as ConcreteComponent,
              {},
              { default: () => h(ViewComponent as ConcreteComponent) }
            );
          }
        });
      };
    }
  });
}

// --- Link component (wraps RouterLink) ---
export const Link = defineComponent({
  name: 'Link',
  props: {
    to: { type: [String, Object] as PropType<string | Record<string, unknown>>, default: undefined },
    href: { type: String, default: undefined },
    replace: { type: Boolean, default: false },
    prefetch: { type: Boolean, default: false },
    activeClass: { type: String, default: 'router-link-active' },
    exactActiveClass: { type: String, default: 'router-link-exact-active' },
    noActiveClass: { type: Boolean, default: false }
  },
  setup(props, { slots, attrs }) {
    const resolvedTo = computed(() => {
      const path = props.to ?? props.href ?? '';
      if (typeof path === 'string' && (path.startsWith('http') || path.startsWith('//') || path.startsWith('#'))) {
        return path;
      }
      return localizePath(path as string);
    });

    const isExternal = computed(() => {
      const path = String(resolvedTo.value);
      return path.startsWith('http') || path.startsWith('//') || path.startsWith('#');
    });

    return () => {
      if (isExternal.value) {
        return h(
          'a',
          {
            ...attrs,
            href: resolvedTo.value,
            target: '_blank',
            rel: 'noopener noreferrer'
          },
          slots.default ? slots.default() : undefined
        );
      }

      return h(
        RouterLink,
        {
          ...attrs,
          to: resolvedTo.value as any,
          replace: props.replace,
          activeClass: props.noActiveClass ? '' : props.activeClass,
          exactActiveClass: props.noActiveClass ? '' : props.exactActiveClass
        },
        slots.default
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

// --- App creation ---
export function createUbeanApp(options: UbeanAppOptions): UbeanAppInstance {
  const initial =
    options.initialPage ||
    ({
      component: '',
      props: {},
      params: {},
      url: '/'
    } as PageObject);

  const head = options.head || createHeadManager(initial.head);
  const transitionOpts: ViewTransitionOptions =
    options.viewTransitions === false
      ? { enabled: false }
      : options.viewTransitions === true || options.viewTransitions == null
        ? { enabled: true }
        : options.viewTransitions;

  const page = reactive<PageObject>({ ...initial }) as any;

  const router = createUbeanRouter({
    routes: options.routes,
    ssr: false
  });

  const LayoutWrapper = createLayoutWrapper(options.resolveLayoutComponent, options.defaultLayout || null);

  const RootComponent = defineComponent({
    name: 'UbeanAppRoot',
    setup() {
      provide(PAGE_KEY, page);
      provide(HEAD_KEY, head);
      provide(TRANSITION_KEY, transitionOpts);

      // Sync route head to head manager
      router.afterEach(to => {
        if (to.meta.head) {
          head.apply(to.meta.head as PageHead);
        }
      });

      return () => h(LayoutWrapper);
    }
  });

  const app = _createApp(RootComponent);
  app.use(router);
  app.component('Link', Link);
  app.component('Head', Head);
  app.config.globalProperties.$ubean = { page, head, router };

  return { app, router, head, page: page as any };
}

// --- SSR App creation ---
export function createUbeanSSRApp(initialPage: PageObject, options: Omit<UbeanAppOptions, 'initialPage'>) {
  const head = options.head || createHeadManager(initialPage.head);
  const page = reactive<PageObject>({ ...initialPage });

  const router = createUbeanRouter({
    routes: options.routes,
    ssr: true,
    initialUrl: initialPage.url
  });

  const LayoutWrapper = createLayoutWrapper(options.resolveLayoutComponent, options.defaultLayout || null);

  const RootComponent = defineComponent({
    name: 'UbeanSSRApp',
    setup() {
      provide(PAGE_KEY, page);
      provide(HEAD_KEY, head);

      return () => h(LayoutWrapper);
    }
  });

  const app = _createSSRApp(RootComponent);
  app.use(router);
  app.component('Link', Link);
  app.component('Head', Head);
  app.config.globalProperties.$ubean = { page, head, router };

  return { app, router };
}

// --- Composables ---
export function usePage<T = Record<string, unknown>>(): PageObject<T> {
  const route = useRoute();
  const pageData = inject<PageObject>(PAGE_KEY, null as any);

  return reactive({
    url: computed(() => route.fullPath),
    params: computed(() => route.params),
    query: computed(() => route.query),
    meta: computed(() => route.meta),
    props: computed(() => pageData?.props || {}),
    component: computed(() => route.meta.pageName || pageData?.component || ''),
    head: computed(() => pageData?.head || null),
    errors: computed(() => pageData?.errors || null)
  }) as any;
}

export interface UbeanRouter {
  push: (url: string, opts?: { replace?: boolean }) => Promise<unknown>;
  replace: (url: string) => Promise<unknown>;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  readonly current: ReturnType<typeof useVueRouter>['currentRoute']['value'];
  readonly navigating: boolean;
  [key: string]: unknown;
}

export function useRouter(): UbeanRouter {
  const router = useVueRouter();
  return {
    ...router,
    push: (url: string, opts?: { replace?: boolean }) => (opts?.replace ? router.replace(url) : router.push(url)),
    replace: (url: string) => router.replace(url),
    back: () => router.back(),
    forward: () => router.forward(),
    refresh: () => router.go(0),
    get current() {
      return router.currentRoute.value;
    },
    get navigating() {
      return false;
    }
  } as UbeanRouter;
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
