/**
 * 汇总本包全部 RPC 函数定义（**裸名**，注册到 `ubean` scope）。
 *
 * 调用方（`ubeanDevframe` 的 `setup`）用 `ctx.scope(UBEAN_RPC_NAMESPACE).rpc.register(fn)`
 * 逐个注册 —— scope 会统一加 `ubean:` 前缀，因此这里**不能**写带 `:` 的名字
 * （devframe 的 `prefixDefinition` 会抛 `DF0034`）。
 *
 * `UbeanRpcFunctions` 是定义元组类型：注册端与客户端都从它的
 * `RpcDefinitionsToFunctionsWithNamespace<'ubean', UbeanRpcFunctions>`
 * 推导 wire 签名，签名只有一处来源。
 */
import type { SharedState } from 'devframe/utils/shared-state';
import type { DevToolsAiServer } from '../../server/ai';
import type { DevToolsCrudServer } from '../../server/crud';
import type { TerminalServer } from '../../server/terminal';
import type { DevToolsInfo } from '../../types';
import { createAiRpcFunctions } from './ai';
import { createCrudRpcFunctions } from './crud';
import { createInfoRpcFunctions } from './info';
import { createPlaygroundRpcFunctions } from './playground';
import { createTerminalRpcFunctions } from './terminal';

export interface RpcDeps {
  state: SharedState<DevToolsInfo>;
  getEnvData: () => Record<string, string>;
  crud: DevToolsCrudServer;
  ai: DevToolsAiServer;
  terminal: TerminalServer;
  getApp?: () => { fetch: (req: Request) => Response | Promise<Response> } | undefined;
}

/**
 * 全部 RPC 定义（裸名）。`setup` 里逐个 `ctx.scope('ubean').rpc.register(fn)`。
 */
export function createAllRpcFunctions(deps: RpcDeps) {
  return [
    ...createInfoRpcFunctions({ state: deps.state, getEnvData: deps.getEnvData }),
    ...createCrudRpcFunctions(deps.crud),
    ...createAiRpcFunctions(deps.ai),
    ...createPlaygroundRpcFunctions({ getApp: deps.getApp }),
    ...createTerminalRpcFunctions(deps.terminal)
  ];
}

/**
 * 全部 RPC 定义的元组类型（每个子模块返回 `as const` 元组，故这里是精确的窄元组）。
 * 客户端侧的 wire 签名由 `RpcDefinitionsToFunctionsWithNamespace<'ubean', UbeanRpcFunctions>`
 * 推导。
 */
export type UbeanRpcFunctions = ReturnType<typeof createAllRpcFunctions>;
