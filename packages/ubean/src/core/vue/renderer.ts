import { defineComponent, h, markRaw, createSSRApp as _createSSRApp } from 'vue';
import type { App, Component, ConcreteComponent } from 'vue';
import { renderToString } from '@vue/server-renderer';
import type { PageObject, PageRenderer, PageAssetTags } from '../../runtime/pages/protocol';

export interface VueRendererOptions {
  resolvePageComponent: (name: string) => Promise<Component>;
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
}

export function createVueRenderer(options: VueRendererOptions): PageRenderer {
  async function resolveComponents(pageObj: PageObject) {
    const layoutName = pageObj.layout === false ? false : pageObj.layout || options.defaultLayout;
    const [pageComp, layoutComp] = await Promise.all([
      options.resolvePageComponent(pageObj.component),
      options.resolveLayoutComponent(layoutName)
    ]);
    return {
      page: markRaw(pageComp),
      layout: layoutComp ? markRaw(layoutComp) : null
    };
  }

  function buildSSRApp(pageObj: PageObject, comps: { page: Component; layout: Component | null }): App {
    const SSRRoot = defineComponent({
      name: 'UbeanSSRRoot',
      setup() {
        return () => {
          const pageVNode = h(comps.page as ConcreteComponent, {
            ...(pageObj.props as any)
          });
          if (comps.layout) {
            return h(comps.layout as ConcreteComponent, { page: pageObj }, { default: () => pageVNode });
          }
          return pageVNode;
        };
      }
    });

    return _createSSRApp(SSRRoot);
  }

  const render: PageRenderer['render'] = async (pageObj: PageObject, _shellHtml: string, _assetTags: PageAssetTags) => {
    const comps = await resolveComponents(pageObj);
    const app = buildSSRApp(pageObj, comps);
    return renderToString(app);
  };

  return {
    render,
    preambleScript: ''
  };
}

export { renderToString } from '@vue/server-renderer';
