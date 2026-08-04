/**
 * `@ubean/ai` public entry.
 *
 * Re-exports the full type surface and declares the entry-point functions.
 * Runtime implementations live in `core.ts` (kernel), `gateway.ts` (provider
 * adapters) and `runtime/vue.ts` (Vue composables); the client entry is
 * `@ubean/ai/runtime/vue`.
 */
// Convenience re-export of the zod instance so tool schemas can be written
// without importing `zod` directly. `z` is a value, not a type.
export { z } from 'zod';

// ---------------------------------------------------------------------------
// Kernel exports (values)
// ---------------------------------------------------------------------------

export { defineProvider, configureAI, resolveModel, defineAgentTool, defineAgent } from './core';

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type {
  ModelString,
  ProviderKind,
  ProviderDefinition,
  ResolvedModel,
  AgentToolContext,
  AgentTool,
  AgentToolSet,
  AgentConfig,
  AgentInput,
  AgentUserMessage,
  AgentAssistantMessage,
  AgentUsage,
  AgentToolCall,
  AgentToolResult,
  AgentRunResult,
  AgentStreamChunk,
  UbeanAgent,
  UbeanAIProviderOptions
} from './types';
