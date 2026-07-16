/**
 * AI RPC functions — `ubean:ai:tools`, `ubean:ai:chat`, and `ubean:ai:chat-stream`.
 *
 * `ubean:ai:chat` — non-streaming chat (returns full response).
 * `ubean:ai:chat-stream` — streaming chat; pushes chunks to the
 *   `ubean:ai:stream` sharedState key via the `onStreamChunk` callback
 *   wired in `createAiServer`. The client subscribes to that sharedState
 *   and filters by `requestId`.
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

  const aiChatStream = defineRpcFunction({
    name: 'ubean:ai:chat-stream',
    type: 'action',
    setup: () => ({
      handler: (params: {
        messages: AiChatMessage[];
        requestId: string;
        apiKey?: string;
        apiBase?: string;
        model?: string;
      }): Promise<AiChatResponse> =>
        ai.chat({
          messages: params.messages,
          apiKey: params.apiKey,
          apiBase: params.apiBase,
          model: params.model,
          requestId: params.requestId
        })
    })
  });

  return [aiTools, aiChat, aiChatStream];
}
