import { defineComponent, h, markRaw, createSSRApp as _createSSRApp } from 'vue';
import type { App, Component, ConcreteComponent } from 'vue';
import { renderToString } from '@vue/server-renderer';
import type { PageObject, PageRenderer, PageAssetTags } from '../../runtime/pages/protocol';
import { getIslandsBootstrapScript } from '../islands';

export interface VueRendererOptions {
  resolvePageComponent: (name: string) => Promise<Component>;
  resolveLayoutComponent: (name: string | false | null | undefined) => Promise<Component | null>;
  defaultLayout?: string | null;
  resolveLayoutParent?: (name: string) => string | null;
}

function defaultResolveLayoutParent(name: string, defaultLayout: string | null): string | null {
  if (!name || name === defaultLayout) return null;

  const lastSlash = name.lastIndexOf('/');
  if (lastSlash > 0) {
    return name.slice(0, lastSlash);
  }

  return defaultLayout;
}

export function createVueRenderer(options: VueRendererOptions): PageRenderer {
  const resolveParent =
    options.resolveLayoutParent || ((name: string) => defaultResolveLayoutParent(name, options.defaultLayout || null));

  async function resolveLayoutChain(
    layoutName: string | false | null | undefined
  ): Promise<{ name: string; component: Component }[]> {
    if (layoutName === false || layoutName == null) return [];

    const chain: { name: string; component: Component }[] = [];
    const visited = new Set<string>();
    let current: string | null = layoutName;

    while (current && !visited.has(current)) {
      visited.add(current);
      const comp = await options.resolveLayoutComponent(current);
      if (comp) {
        chain.push({ name: current, component: markRaw(comp) });
      }
      current = resolveParent(current);
    }

    return chain;
  }

  async function resolveComponents(pageObj: PageObject) {
    const layoutName = pageObj.layout === false ? false : pageObj.layout || options.defaultLayout;
    const [pageComp, layoutChain] = await Promise.all([
      options.resolvePageComponent(pageObj.component),
      resolveLayoutChain(layoutName)
    ]);
    return {
      page: markRaw(pageComp),
      layouts: layoutChain
    };
  }

  function buildSSRApp(
    pageObj: PageObject,
    comps: { page: Component; layouts: { name: string; component: Component }[] }
  ): App {
    const SSRRoot = defineComponent({
      name: 'UbeanSSRRoot',
      setup() {
        return () => {
          let vnode: any = h(comps.page as ConcreteComponent, {
            ...(pageObj.props as any)
          });

          for (let i = comps.layouts.length - 1; i >= 0; i--) {
            const layout = comps.layouts[i];
            const child = vnode;
            vnode = h(
              layout.component as ConcreteComponent,
              { page: pageObj, layoutName: layout.name },
              { default: () => child }
            );
          }

          return vnode;
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
    preambleScript: getIslandsBootstrapScript()
  };
}

export { renderToString } from '@vue/server-renderer';
