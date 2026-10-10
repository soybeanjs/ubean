import type { DevToolsAiServer, AiChatMessage, AiChatResponse } from '../../server/ai';
/**
 * AI RPC functions — `ai-tools` / `ai-chat` / `ai-chat-stream`（裸名，注册到 `ubean` scope）。
 *
 * - `ai-chat` 非流式（返回完整响应）；
 * - `ai-chat-stream` 流式：分片由 `createAiServer` 里的 `onStreamChunk` 推入
 *   `ubean:ai:stream` shared state，客户端订阅后按 `requestId` 过滤。
 */
import { defineUbeanRpc } from './types';

export function createAiRpcFunctions(ai: DevToolsAiServer) {
  const aiTools = defineUbeanRpc({
    name: 'ai-tools',
    type: 'query',
    setup: () => ({
      handler: () => ai.getToolDefinitions()
    })
  });

  const aiChat = defineUbeanRpc({
    name: 'ai-chat',
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

  const aiChatStream = defineUbeanRpc({
    name: 'ai-chat-stream',
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

  return [aiTools, aiChat, aiChatStream] as const;
}
