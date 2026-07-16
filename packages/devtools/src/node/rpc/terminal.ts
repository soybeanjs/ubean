/**
 * Terminal RPC functions — `ubean:terminal:start/input/resize/poll/kill`.
 *
 * Delegates to `createTerminalServer` which manages shell processes and
 * output buffering. The client polls for output via `ubean:terminal:poll`.
 */
import { defineRpcFunction } from '@vitejs/devtools-kit';
import type { TerminalServer } from '../../server/terminal';
import type { TerminalStartParams, TerminalPollResult } from '../../server/terminal';

export function createTerminalRpcFunctions(terminal: TerminalServer) {
  const terminalStart = defineRpcFunction({
    name: 'ubean:terminal:start',
    type: 'action',
    setup: () => ({
      handler: (params: TerminalStartParams) =>
        Promise.resolve(terminal.start(params))
    })
  });

  const terminalInput = defineRpcFunction({
    name: 'ubean:terminal:input',
    type: 'action',
    setup: () => ({
      handler: (params: { sessionId: string; data: string }) =>
        Promise.resolve(terminal.input(params.sessionId, params.data))
    })
  });

  const terminalResize = defineRpcFunction({
    name: 'ubean:terminal:resize',
    type: 'action',
    setup: () => ({
      handler: (params: { sessionId: string; cols: number; rows: number }) =>
        Promise.resolve(terminal.resize(params.sessionId, params.cols, params.rows))
    })
  });

  const terminalPoll = defineRpcFunction({
    name: 'ubean:terminal:poll',
    type: 'query',
    setup: () => ({
      handler: (params: { sessionId: string }): Promise<TerminalPollResult> =>
        Promise.resolve(terminal.poll(params.sessionId))
    })
  });

  const terminalKill = defineRpcFunction({
    name: 'ubean:terminal:kill',
    type: 'action',
    setup: () => ({
      handler: (params: { sessionId: string }) =>
        Promise.resolve(terminal.kill(params.sessionId))
    })
  });

  return [terminalStart, terminalInput, terminalResize, terminalPoll, terminalKill];
}
