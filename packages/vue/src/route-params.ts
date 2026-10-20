/**
 * `vue-router` 路径参数 → `RouteRecordInfo` 类型字面量。
 *
 * `generator.ts`(构建期 `.ubean/typed-router.d.ts`)与 `virtual-pages.ts`
 * (virtual 模块伴生 d.ts)共用同一份实现 —— 两边各有一份手抄副本时,
 * 修了 repeatable 修饰符却只改一处就会产出两种类型。
 */

/** 参数在路径里出现的形态。`*` 与 `[[x]]+` 都归一为 `zeroOrMore`。 */
export type RouteParamKind = 'required' | 'zeroOrOne' | 'oneOrMore' | 'zeroOrMore';

export interface RouteParam {
  name: string;
  kind: RouteParamKind;
}

/** 生成 d.ts 时统一使用的 vue-router 类型导入行。 */
export const PARAM_TYPE_IMPORT =
  "import type { RouteRecordInfo, ParamValue, ParamValueZeroOrOne, ParamValueOneOrMore, ParamValueZeroOrMore } from 'vue-router';";

const MODIFIER_TO_KIND: Record<string, RouteParamKind> = {
  '?': 'zeroOrOne',
  '*': 'zeroOrMore',
  '+': 'oneOrMore'
};

/**
 * 从 vue-router 风格路径中提取参数信息。
 *
 * 支持:`:name`、`:name?`、`:name*`、`:name+`、`:name(...)`。
 * 不识别 `:pathMatch(.*)*`(vue-router 的 404 catch-all)—— 它是路由器内部约定,
 * 不是页面参数,所以先整体剔掉;否则会凭空多出一个 `pathMatch: ParamValue<...>`。
 *
 * @returns 参数数组,顺序与 path 中出现顺序一致
 */
export function extractRouteParams(path: string): RouteParam[] {
  const params: RouteParam[] = [];
  // `:name` 后跟可选的 `(...)` 正则,以及 `?`/`*`/`+` 修饰符
  const paramRegex = /:([A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?([?*+]?)/g;
  let match: RegExpExecArray | null;
  const scannable = path.replace(/\/:pathMatch\([^)]*\)\*?/g, '');
  while ((match = paramRegex.exec(scannable)) !== null) {
    const name = match[1]!;
    const kind = MODIFIER_TO_KIND[match[2]!] ?? 'required';
    // 去重:vue-router 不允许同名参数出现两次
    if (!params.some(p => p.name === name)) {
      params.push({ name, kind });
    }
  }
  return params;
}

const PARAM_VALUE_TYPE: Record<RouteParamKind, string> = {
  required: 'ParamValue',
  zeroOrOne: 'ParamValueZeroOrOne',
  oneOrMore: 'ParamValueOneOrMore',
  zeroOrMore: 'ParamValueZeroOrMore'
};

/**
 * 渲染参数类型字面量,用于 `RouteRecordInfo` 的 `ParamsRaw` / `Params` 位置。
 *
 * `isRaw: true` 渲染原始输入类型(如 `ParamValue<true>`),`false` 渲染解析后
 * 类型。repeatable 参数渲染为元组/数组类型(`ParamValueOneOrMore` 等),因此
 * 页面里 `route.params.slugs` 能正确推断为 `string[]` 而不是 `string`。
 */
export function renderParamsType(params: RouteParam[], isRaw: boolean): string {
  if (params.length === 0) {
    return 'Record<never, never>';
  }
  const entries = params.map(p => {
    const optional = p.kind === 'zeroOrOne' || p.kind === 'zeroOrMore';
    const optionalMarker = optional ? '?' : '';
    const type = `${PARAM_VALUE_TYPE[p.kind]}<${isRaw ? 'true' : 'false'}>`;
    return `    ${p.name}${optionalMarker}: ${type}`;
  });
  return `{\n${entries.join(',\n')}\n  }`;
}
