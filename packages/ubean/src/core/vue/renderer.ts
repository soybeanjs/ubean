import type { Component } from 'vue';
import { renderToString } from '@vue/server-renderer';
import type { RouteRecordRaw } from 'vue-router';
import type { PageObject, PageRenderer, PageAssetTags } from '../../runtime/pages/protocol';
import { createUbeanSSRApp } from '../../runtime/vue/app';
import { getIslandsBootstrapScript } from '../islands';

export interface VueRendererOptions {
  routes: RouteRecordRaw[];
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
}

export function createVueRenderer(options: VueRendererOptions): PageRenderer {
  const render: PageRenderer['render'] = async (pageObj: PageObject, _shellHtml: string, _assetTags: PageAssetTags) => {
    const { app, router } = createUbeanSSRApp(pageObj, {
      routes: options.routes,
      resolveLayoutComponent: options.resolveLayoutComponent,
      defaultLayout: options.defaultLayout
    });

    await router.isReady();
    return renderToString(app);
  };

  return {
    render,
    preambleScript: getIslandsBootstrapScript()
  };
}

export { renderToString } from '@vue/server-renderer';
