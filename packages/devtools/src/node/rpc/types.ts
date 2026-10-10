/**
 * RPC 类型与命名空间常量（Task 3，devframe 迁移）。
 *
 * `RpcFunctionDefinition` 从 **`devframe/rpc`** 导入 —— devframe 把它从
 * `devframe/rpc` 导出（而不是 `devframe` 根或 `devframe/types`），因此这里只做一次
 * re-export，让本包各 RPC 模块有统一的 import 源。
 *
 * 命名空间：`ctx.scope('ubean')` 给**裸名**加 `ubean:` 前缀，所以 wire 名是
 * `ubean:get-info` / `ubean:crud-create`（**单冒号**）。旧的 DTK 写法用的是
 * `ubean:crud:create` 双冒号 —— 那在 scoped 注册下会直接抛 `DF0034`（devframe 的
 * `prefixDefinition` 只接受不含 `:` 的裸名）。
 */

import type { RpcFunctionDefinition } from 'devframe/rpc';

export type { RpcFunctionDefinition };

/**
 * 身份包装器：校验定义形状，同时**保留 `name` 的字面量类型**。
 *
 * 直接用 `satisfies RpcFunctionDefinition` 不行 —— 那个类型至少要一个类型参数（`NAME`），
 * 不传参就把 `name` 拓宽成 `string`，而 `RpcDefinitionsToFunctionsWithNamespace<'ubean', T>`
 * 恰恰靠字面量名推导 wire 签名。泛型参数 `const D extends …` 同时满足两件事：约束检查 + 字面量保留。
 */
export function defineUbeanRpc<const D extends RpcFunctionDefinition<string, any, any, any, any, any, any>>(
  definition: D
): D {
  return definition;
}

/**
 * 本包 RPC 的命名空间。所有裸名注册后成为 `<UBEAN_RPC_NAMESPACE>:<bare-name>`。
 */
export const UBEAN_RPC_NAMESPACE = 'ubean';

/**
 * `ubean:ai:stream` —— AI 流式响应的 shared state key。
 *
 * **不是** scoped key：`ctx.scope('ubean').rpc.sharedState.get('ai:stream')` 会再加一层前缀
 * （`ubean:ai:stream` 本身已含 `:`，`qualifyName` 原样返回，因此两种写法恰好都落到这个 key）。
 * 这里显式写全名，避免读者以为它经过 scope。
 */
export const UBEAN_AI_STREAM_STATE_KEY = 'ubean:ai:stream';

/**
 * anchor dock 的共享 iframe 配置。
 *
 * `frameId` / `subTabs` 属于 **`DevframeViewIframe`**（不是 `DevframeDockDefaults`），
 * 因此不能写在 `DevframeDefinition.dock` 里 —— 它们必须经
 * `initHub({ devframes: [{ devframe, dock }] })`（或 `ctx.install(def, { dock })`）传入。
 * 这里集中一处，CLI 与测试都从这里取。
 *
 * - `frameId`：所有视图 dock 共用一个 iframe 元素（软导航池）。
 * - `subTabs`：客户端 host 自动挂 frame-nav 适配器，运行时发现视图清单。
 *
 * **不要设 `visibility: 'false'`**：它会隐藏 anchor 自己的 dock 按钮，而 iframe 只在 anchor
 * 被激活时才挂载 —— 隐藏 anchor 就永远发现不了视图清单，外壳里只剩一个空的 dock 侧栏
 * （实测 2026-10-11：面板整个打不开）。
 */
export const UBEAN_ANCHOR_DOCK = {
  frameId: 'ubean',
  subTabs: { protocol: 'postmessage' }
} as const;
