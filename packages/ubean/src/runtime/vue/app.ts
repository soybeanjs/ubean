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
import { useHead as useUnheadHead } from '@unhead/vue';
import type { VueHeadClient, UseHeadInput } from '@unhead/vue';
import { Head as UnheadHeadComponent } from '@unhead/vue/components';
import type { PageObject, PageHead } from '../pages/protocol';
import { localizePath } from './i18n';
import { createUbeanRouter } from './router';
import { supportsViewTransitions } from './view-transitions';
import type { ViewTransitionOptions } from './view-transitions';

const PAGE_KEY = Symbol('ubean-page');
const TRANSITION_KEY = Symbol('ubean-transition');

export type { VueHeadClient };

export interface UbeanAppOptions {
  routes: RouteRecordRaw[];
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  initialPage?: PageObject;
  head?: VueHeadClient;
  viewTransitions?: boolean | ViewTransitionOptions;
}

export interface UbeanAppInstance {
  app: App;
  router: ReturnType<typeof createUbeanRouter>;
  head: VueHeadClient;
  page: Record<string, unknown>;
}

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

export const Head = UnheadHeadComponent;

function createRootComponent(
  LayoutWrapper: Component,
  page: PageObject,
  transitionOpts: ViewTransitionOptions,
  isSSR: boolean
) {
  return defineComponent({
    name: isSSR ? 'UbeanSSRApp' : 'UbeanAppRoot',
    setup() {
      provide(PAGE_KEY, page);
      provide(TRANSITION_KEY, transitionOpts);

      const route = useRoute();

      const routeHead = computed(() => {
        return (route.meta.head as PageHead) || {};
      });

      useUnheadHead(routeHead as unknown as UseHeadInput);

      return () => h(LayoutWrapper);
    }
  });
}

export function createUbeanApp(options: UbeanAppOptions): UbeanAppInstance {
  if (!options.head) {
    throw new Error('[ubean] createUbeanApp requires a head instance from @unhead/vue/client');
  }

  const initial =
    options.initialPage ||
    ({
      component: '',
      props: {},
      params: {},
      url: '/'
    } as PageObject);

  const head = options.head;
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

  const RootComponent = createRootComponent(LayoutWrapper, page as any, transitionOpts, false);

  const app = _createApp(RootComponent);
  app.use(head);
  app.use(router);
  app.component('Link', Link);
  app.config.globalProperties.$ubean = { page, head, router };

  return { app, router, head, page: page as any };
}

export function createUbeanSSRApp(initialPage: PageObject, options: Omit<UbeanAppOptions, 'initialPage'>) {
  if (!options.head) {
    throw new Error('[ubean] createUbeanSSRApp requires a head instance from @unhead/vue/server');
  }

  const head = options.head;
  const page = reactive<PageObject>({ ...initialPage });

  const router = createUbeanRouter({
    routes: options.routes,
    ssr: true,
    initialUrl: initialPage.url
  });

  const LayoutWrapper = createLayoutWrapper(options.resolveLayoutComponent, options.defaultLayout || null);

  const RootComponent = createRootComponent(LayoutWrapper, page as any, { enabled: false }, true);

  const app = _createSSRApp(RootComponent);
  app.use(head);
  app.use(router);
  app.component('Link', Link);
  app.config.globalProperties.$ubean = { page, head, router };

  return { app, router, head };
}

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

export { useUnheadHead as useHead };
export { useSeoMeta } from '@unhead/vue';

export function useViewTransition() {
  const opts = inject<ViewTransitionOptions>(TRANSITION_KEY, { enabled: true });
  return {
    enabled: opts.enabled !== false && supportsViewTransitions(),
    supports: supportsViewTransitions(),
    options: opts
  };
}
