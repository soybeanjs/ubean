import type { SharedState } from 'devframe/utils/shared-state';
import { maskSensitiveEnv } from '../../shared/env';
import type { DevToolsInfo } from '../../types';
/**
 * Info RPC functions — `get-info` 与 `get-env`（裸名，注册到 `ubean` scope）。
 *
 * sharedState 模型下 `get-info` 只是给**还没订阅** `ubean:info` 的客户端的兜底；正常客户端
 * 直接 `client.sharedState.get('ubean:info')`。
 */
import { defineUbeanRpc } from './types';

export interface InfoRpcDeps {
  state: SharedState<DevToolsInfo>;
  getEnvData: () => Record<string, string>;
}

/**
 * 返回定义数组（**裸名**）。调用方用
 * `RpcDefinitionsToFunctionsWithNamespace<'ubean', typeof …>` 推导 wire 签名。
 */
export function createInfoRpcFunctions(opts: InfoRpcDeps) {
  const getInfo = defineUbeanRpc({
    name: 'get-info',
    type: 'query',
    setup: () => ({
      handler: () => opts.state.value()
    })
  });

  const getEnv = defineUbeanRpc({
    name: 'get-env',
    type: 'query',
    setup: () => ({
      handler: () => maskSensitiveEnv(opts.getEnvData())
    })
  });

  return [getInfo, getEnv] as const;
}
