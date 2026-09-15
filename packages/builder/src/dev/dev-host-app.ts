/**
 * 宿主 dev app 的装配（RM-V11，从 CLI dev server 搬到 `@ubean/build`）。
 *
 * 这一层回答的是「dev 下 Hono app 与 Vite 模块图怎么接上」：app 的 routes/pages/middleware/
 * crons 都是**文件路径**，dev 下必须经 Vite 的 SSR 图加载（`ssrLoadModule`）才能拿到转换后的
 * 模块，并保证与组件侧共用同一份 vue / vue-router 实例（否则注入键是实例级 Symbol，SSR
 * 直接崩）。因此这里只做接线，不创建 app 本身 —— app 由调用方给出（CLI 现在给，RM-V12 之后
 * 由插件自举时给）。
 *
 * 依赖面刻意用结构化类型而不是 `import type { UbeanApp } from '@ubean/app'`：builder 不该为了
 * 一个类型把 app 包拉进依赖图（`EnvRunnerLike` 同理）。任何形状匹配的 app 都能用。
 */
import type { PageRenderer } from '@ubean/pages';
import type { ScannedLayout, ScannedPageRoute } from '@ubean/scan';
import { buildDevSsrRoutes } from './dev-ssr-routes';

/** `@ubean/app` 的 `UbeanApp` 在本模块用到的最小面。 */
export interface DevHostAppLike {
  options: {
    layouts?: ScannedLayout[];
    routes?: Array<{ relativePath: string; fullPath: string }>;
    pages?: ScannedPageRoute[];
    middleware?: Array<{ relativePath: string; fullPath: string }>;
    crons?: Array<{ fullPath: string }>;
    notFoundPage?: ScannedPageRoute;
    routeLoaders?: Record<string, () => Promise<unknown>>;
    pageLoaders?: Record<string, () => Promise<unknown>>;
    middlewareLoaders?: Record<string, () => Promise<unknown>>;
    pageRenderer?: PageRenderer | null;
  };
  resetInit(): void;
}

/** 渲染器工厂的入参（与 `@ubean/client/ssr` 的 `createVueRenderer` 同形）。 */
export interface DevRendererOptions {
  routes: ReturnType<typeof buildDevSsrRoutes>;
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<unknown>;
  defaultLayout: string | null;
  resolveAppConfig: () => Promise<unknown>;
}

export interface EnhanceDevAppOptions {
  app: DevHostAppLike;
  layouts?: ScannedLayout[];
  /** 经 Vite SSR 图加载模块；dev 下必须是 `server.ssrLoadModule`。 */
  loadModule: (id: string) => Promise<unknown>;
  /**
   * 渲染器工厂。**必须**取自 Vite SSR 图
   * （`(await server.ssrLoadModule('@ubean/client/ssr')).createVueRenderer`）：
   * 静态 import 会让 `@ubean/client` 用自身嵌套的 vue-router 副本创建 router（provide 侧），
   * 而组件在 Vite SSR 图里解析到另一副本（inject 侧），注入键是实例级 Symbol，不一致即崩。
   * 每次 enhance 都会调用它 —— 路由表与会话内的配置缓存都随之刷新。
   */
  createRenderer: (options: DevRendererOptions) => PageRenderer;
  /** 与客户端 `virtual:ubean-pages` 相同的 locale param（`:locale(zh)?`）。 */
  localeVueParam?: string;
  /** `backend` 模式无页面与 SSR，跳过 pageRenderer 创建。 */
  backend?: boolean;
  /** crons 加载完后的启动钩子（CLI 传 `@ubean/server/cron` 的 `startCronScheduler`）。 */
  startCronScheduler?: () => unknown;
  /** 诊断用日志（默认 `console.error`，与原先行为一致）。 */
  onCronError?: (error: unknown) => void;
}

/**
 * 把 Vite SSR 图的加载器与 SSR 渲染器接到 host app 上。
 *
 * 必须在**每次** app 实例更新后调用（CLI 的 `updateApp`）：闭包持有模块加载器，
 * HMR 后需要重新指向新的扫描结果与 Vite 模块图。
 */
export function enhanceDevApp(options: EnhanceDevAppOptions): DevHostAppLike {
  const { app, layouts = [], loadModule, localeVueParam, backend, startCronScheduler, onCronError } = options;

  app.options.layouts = layouts;

  const routeLoaders: Record<string, () => Promise<unknown>> = {};
  for (const route of app.options.routes || []) {
    const fullPath = route.fullPath;
    routeLoaders[route.relativePath] = () => loadModule(fullPath);
  }
  app.options.routeLoaders = routeLoaders;

  // reuse 路由只带 `definePage` 元数据，加载它拿不到 Vue 组件 —— 必须加载目标页面的模块。
  const pageByName = new Map<string, ScannedPageRoute>();
  for (const page of app.options.pages || []) pageByName.set(page.name, page);

  const pageLoaders: Record<string, () => Promise<unknown>> = {};
  for (const page of app.options.pages || []) {
    const target = page.isReuse && page.reuseTarget ? pageByName.get(page.reuseTarget) : undefined;
    const fullPath = target?.fullPath || page.fullPath;
    pageLoaders[page.relativePath] = () => loadModule(fullPath);
  }
  app.options.pageLoaders = pageLoaders;

  const middlewareLoaders: Record<string, () => Promise<unknown>> = {};
  for (const mw of app.options.middleware || []) {
    const fullPath = mw.fullPath;
    middlewareLoaders[mw.relativePath] = () => loadModule(fullPath);
  }
  app.options.middlewareLoaders = middlewareLoaders;

  // 预加载 cron 文件：`defineScheduled()` 是模块副作用，必须在与 API 路由**同一份**
  // Vite 模块图实例里求值，否则调度器里注册的是另一个实例的任务。
  const cronFiles = app.options.crons || [];
  if (cronFiles.length > 0 && startCronScheduler) {
    Promise.all(cronFiles.map(c => loadModule(c.fullPath)))
      .then(() => startCronScheduler())
      .catch(error => {
        if (onCronError) onCronError(error);
        else console.error('[ubean] Failed to load cron files:', error);
      });
  }

  if (backend) {
    app.resetInit();
    return app;
  }

  const layoutMap = new Map<string, string>();
  for (const layout of layouts) layoutMap.set(layout.name, layout.fullPath);
  const defaultLayout = layouts.find(l => l.isDefault)?.name || null;

  // SSR 路由表与客户端 `virtual:ubean-pages` 同形（含 404 catch-all）——见 dev-ssr-routes.ts。
  const routes = buildDevSsrRoutes({
    pages: app.options.pages || [],
    layouts,
    localeVueParam,
    loadComponent: loadModule,
    notFoundPage: app.options.notFoundPage
  });

  // 惰性加载用户的 defineApp 配置：每次 enhance 都重新取，HMR 改 `app.ts` / `app.server.ts`
  // 才能立刻生效（缓存只在本次 enhance 的生命周期内）。
  let appConfigModule: Promise<{ resolveAppConfig?: (mode: string) => unknown }> | null = null;
  const getAppConfigModule = () => {
    if (!appConfigModule) {
      appConfigModule = loadModule('virtual:ubean-app') as Promise<{ resolveAppConfig?: (mode: string) => unknown }>;
    }
    return appConfigModule;
  };

  // 渲染器必须经 Vite SSR 图加载（调用方传进来的 `loadModule('@ubean/client/ssr')`）。
  app.options.pageRenderer = options.createRenderer({
    routes,
    async resolveLayoutComponent(name) {
      if (name === false || name == null) return null;
      const fullPath = layoutMap.get(name);
      if (!fullPath) return null;
      const mod = (await loadModule(fullPath)) as { default?: unknown };
      return mod.default || mod;
    },
    defaultLayout,
    async resolveAppConfig() {
      const mod = await getAppConfigModule();
      return mod.resolveAppConfig?.('server');
    }
  });

  return app;
}

export type { PageRenderer };
