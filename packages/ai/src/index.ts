/**
 * `@ubean/ai` public entry.
 *
 * Re-exports the full type surface and declares the entry-point functions.
 * Runtime implementations live in `core.ts` (kernel), `gateway.ts` (provider
 * adapters) and `runtime/vue.ts` (Vue composables); the client entry is
 * `@ubean/ai/runtime/vue`.
 */
// Convenience namespace re-export of valibot so tool schemas can be written
// without importing `valibot` directly, e.g. `v.object({ key: v.string() })`.
export * as v from 'valibot';

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
