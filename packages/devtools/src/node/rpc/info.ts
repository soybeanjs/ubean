/**
 * Info RPC functions — `ubean:get-info` and `ubean:get-env`.
 *
 * In the sharedState model, `ubean:get-info` is a fallback for clients
 * that haven't subscribed to the `ubean:info` state yet. Most clients
 * should use `client.sharedState.get('ubean:info')` instead.
 */
import { defineRpcFunction } from '@vitejs/devtools-kit';
import type { SharedState } from 'devframe/utils/shared-state';
import { maskSensitiveEnv } from '../../shared/env';
import type { DevToolsInfo } from '../../types';

export function createInfoRpcFunctions(opts: {
  state: SharedState<DevToolsInfo>;
  getEnvData: () => Record<string, string>;
}) {
  const getInfo = defineRpcFunction({
    name: 'ubean:get-info',
    type: 'query',
    setup: () => ({
      handler: () => opts.state.value()
    })
  });

  const getEnv = defineRpcFunction({
    name: 'ubean:get-env',
    type: 'query',
    setup: () => ({
      handler: () => maskSensitiveEnv(opts.getEnvData())
    })
  });

  return [getInfo, getEnv];
}
