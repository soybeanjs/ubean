/**
 * 框架层 `usePage()` — 路由感知的响应式页面上下文。
 *
 * 精简内核 `@ubean/vue` 的 `usePage()` 只返回 `PAGE_KEY` 注入的
 * pageData(props/component/errors);框架页面协议(vue-node 风格的
 * PageObject:url/params/query/meta)在这里补全 —— 字段路由驱动,
 * `props`/`errors` 来自工厂提供的 `PAGE_KEY` 数据(SSR 初始数据)。
 *
 * 路由态之所以保留在框架层:框架页面的 SSR 首屏依赖 initialPage
 * 数据,客户端导航后由 route 驱动刷新,合并语义属于框架协议。
 */
import { computed, inject, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { PAGE_KEY } from '@ubean/vue';

/**
 * 框架页面上下文(reactive,属性访问即取值)。
 *
 * 泛型 `TParams` 约束 params 形状:`usePage<{ id: string }>()` 后
 * `page.params.id` 即为 `string`。
 */
export interface UbeanVuePage<
  TParams extends Record<string, unknown> = Record<string, unknown>,
  TProps = Record<string, unknown>
> {
  url: string;
  params: TParams;
  query: Record<string, unknown>;
  meta: Record<string, unknown>;
  props: Record<string, TProps>;
  component: string;
  errors: Record<string, string> | null;
}

export function usePage<
  TParams extends Record<string, unknown> = Record<string, unknown>,
  TProps = Record<string, unknown>
>(): UbeanVuePage<TParams, TProps> {
  const route = useRoute();
  const pageData = inject<{
    props?: Record<string, unknown>;
    component?: string;
    errors?: Record<string, string> | null;
  } | null>(PAGE_KEY, null);

  // `reactive()` 自动解包各字段的 computed —— 属性访问即取值且保持响应性。
  return reactive({
    url: computed(() => route.fullPath),
    params: computed(() => route.params as unknown as TParams),
    query: computed(() => route.query),
    meta: computed(() => route.meta),
    props: computed(() => (pageData?.props as Record<string, TProps>) || {}),
    component: computed(() => (route.meta.pageName as string) || pageData?.component || ''),
    errors: computed(() => pageData?.errors || null)
  }) as UbeanVuePage<TParams, TProps>;
}
