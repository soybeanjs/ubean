/**
 * AI RPC functions — `ubean:ai:tools` and `ubean:ai:chat`.
 *
 * Delegates to the existing `createAiServer` which owns the command
 * parser, tool execution, and optional LLM API forwarding.
 */
import { defineRpcFunction } from '@vitejs/devtools-kit';
import type { DevToolsAiServer, AiChatMessage, AiChatResponse } from '../../server/ai';

export function createAiRpcFunctions(ai: DevToolsAiServer) {
  const aiTools = defineRpcFunction({
    name: 'ubean:ai:tools',
    type: 'query',
    setup: () => ({
      handler: () => ai.getToolDefinitions()
    })
  });

  const aiChat = defineRpcFunction({
    name: 'ubean:ai:chat',
    type: 'action',
    setup: () => ({
      handler: (params: {
        messages: AiChatMessage[];
        apiKey?: string;
        apiBase?: string;
        model?: string;
      }): Promise<AiChatResponse> =>
        ai.chat({
          messages: params.messages,
          apiKey: params.apiKey,
          apiBase: params.apiBase,
          model: params.model
        })
    })
  });

  return [aiTools, aiChat];
}
