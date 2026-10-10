import type { TerminalServer, TerminalStartParams, TerminalPollResult } from '../../server/terminal';
/**
 * Terminal RPC functions — `terminal-start` / `terminal-input` / `terminal-resize` /
 * `terminal-poll` / `terminal-kill`（裸名，注册到 `ubean` scope）。
 *
 * 委派给 `createTerminalServer`（管理 shell 进程与输出缓冲）。客户端通过
 * `terminal-poll` 拉取输出。
 */
import { defineUbeanRpc } from './types';

export function createTerminalRpcFunctions(terminal: TerminalServer) {
  const terminalStart = defineUbeanRpc({
    name: 'terminal-start',
    type: 'action',
    setup: () => ({
      handler: (params: TerminalStartParams) => Promise.resolve(terminal.start(params))
    })
  });

  const terminalInput = defineUbeanRpc({
    name: 'terminal-input',
    type: 'action',
    setup: () => ({
      handler: (params: { sessionId: string; data: string }) =>
        Promise.resolve(terminal.input(params.sessionId, params.data))
    })
  });

  const terminalResize = defineUbeanRpc({
    name: 'terminal-resize',
    type: 'action',
    setup: () => ({
      handler: (params: { sessionId: string; cols: number; rows: number }) =>
        Promise.resolve(terminal.resize(params.sessionId, params.cols, params.rows))
    })
  });

  const terminalPoll = defineUbeanRpc({
    name: 'terminal-poll',
    type: 'query',
    setup: () => ({
      handler: (params: { sessionId: string }): Promise<TerminalPollResult> =>
        Promise.resolve(terminal.poll(params.sessionId))
    })
  });

  const terminalKill = defineUbeanRpc({
    name: 'terminal-kill',
    type: 'action',
    setup: () => ({
      handler: (params: { sessionId: string }) => Promise.resolve(terminal.kill(params.sessionId))
    })
  });

  return [terminalStart, terminalInput, terminalResize, terminalPoll, terminalKill] as const;
}
