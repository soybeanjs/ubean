/**
 * Aggregates all ubean devtools RPC function definitions.
 *
 * Each sub-module returns an array of `RpcFunctionDefinition` objects
 * produced by `defineRpcFunction`. The plugin registers them all via
 * `ctx.rpc.register(fn)` during `devtools.setup`.
 */
import type { SharedState } from 'devframe/utils/shared-state';
import type { DevToolsInfo } from '../../types';
import type { DevToolsCrudServer } from '../../server/crud';
import type { DevToolsAiServer } from '../../server/ai';
import { createInfoRpcFunctions } from './info';
import { createCrudRpcFunctions } from './crud';
import { createAiRpcFunctions } from './ai';
import { createPlaygroundRpcFunctions } from './playground';

export interface RpcDeps {
  state: SharedState<DevToolsInfo>;
  getEnvData: () => Record<string, string>;
  crud: DevToolsCrudServer;
  ai: DevToolsAiServer;
  getApp?: () => { fetch: (req: Request) => Response | Promise<Response> } | undefined;
}

/**
 * Returns an array of `defineRpcFunction` definitions. The return type is
 * intentionally loose (`any[]`) because the DTK `ctx.rpc.register()` accepts
 * definitions parameterized on `ViteDevToolsNodeContext`, and the exact
 * generic instantiation varies per function — the individual functions are
 * already type-checked at their definition site.
 */
export function createAllRpcFunctions(deps: RpcDeps): any[] {
  return [
    ...createInfoRpcFunctions({ state: deps.state, getEnvData: deps.getEnvData }),
    ...createCrudRpcFunctions(deps.crud),
    ...createAiRpcFunctions(deps.ai),
    ...createPlaygroundRpcFunctions({ getApp: deps.getApp })
  ];
}
