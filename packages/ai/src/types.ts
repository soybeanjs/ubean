import type { Handler } from 'hono';
import type { GenericSchema, InferOutput } from 'valibot';

/**
 * @ubean/ai type definitions.
 *
 * Kernel design (B2): a thin, declarative orchestration layer over the Vercel
 * AI SDK (`ai` / `@ai-sdk/openai-compatible`). The agent loop, tool-calling
 * protocol and streaming are delegated to the AI SDK; this package only adds
 * a ubean-idiomatic configuration surface, provider resolution and a Vue
 * runtime. It does NOT re-implement an agent loop or a gateway.
 */

// ---------------------------------------------------------------------------
// Provider & model
// ---------------------------------------------------------------------------

/**
 * A model reference in the form `"provider/model"`, e.g. `"deepseek/deepseek-chat"`,
 * `"openai/gpt-5.4"`, `"openrouter/anthropic/claude-3.5-sonnet"`.
 *
 * The provider segment is resolved against the provider registry (see
 * `resolveProvider`). The special provider `"openai-compatible"` (or any
 * provider resolved through the gateway/baseURL mechanism) maps to
 * `@ai-sdk/openai-compatible`.
 */
export type ModelString = string;

/** Provider kind used to pick the underlying AI SDK provider factory. */
export type ProviderKind = 'openai-compatible' | 'openai' | 'anthropic' | 'google' | 'custom';

/** A registered provider that `@ubean/ai` can resolve `provider/model` strings against. */
export interface ProviderDefinition {
  /** Provider identifier used in the `provider/model` string. */
  id: string;
  /** Provider kind — currently only `openai-compatible` is bundled. */
  kind: ProviderKind;
  /** Base URL for the OpenAI-compatible API. */
  baseURL: string;
  /** API key. Prefer injecting via runtime config / env rather than hardcoding. */
  apiKey?: string;
  /** Optional extra headers forwarded to the provider. */
  headers?: Record<string, string>;
  /** Optional per-provider model alias map (alias → canonical model id). */
  modelAliases?: Record<string, string>;
}

/** Provider registry used by the kernel. Registered via `defineProvider` / `useUbeanAI`. */
export interface ProviderRegistry {
  providers: Map<string, ProviderDefinition>;
  get(id: string): ProviderDefinition | undefined;
  set(definition: ProviderDefinition): void;
  resolve(model: ModelString): ResolvedModel;
}

/** The result of resolving a `provider/model` string. */
export interface ResolvedModel {
  /** The provider definition that handled the model string. */
  provider: ProviderDefinition;
  /** The model id to pass to the provider factory. */
  modelId: string;
}

// ---------------------------------------------------------------------------
// Agent tool
// ---------------------------------------------------------------------------

/** Context passed to a tool's `execute`. Carries per-run request metadata. */
export interface AgentToolContext {
  /** A stable id for the current agent run. */
  runId: string;
  /** Free-form metadata injected by the caller (e.g. an authenticated user). */
  meta?: Record<string, unknown>;
  /** Abort signal to cancel the run. */
  signal?: AbortSignal;
}

/**
 * A declarative ubean tool. `execute` may use ubean server helpers
 * (defineHandler, fetch, storage, ...) and must return a JSON-serializable value.
 */
export interface AgentTool<TInput extends GenericSchema = GenericSchema> {
  /** Unique tool name sent to the model (lowercase, safe identifier). */
  name: string;
  /** Description used by the model for tool selection. */
  description: string;
  /** Valibot schema describing the tool's arguments. */
  input: TInput;
  /** Executes the tool; `args` is the parsed input. */
  execute: (args: InferOutput<TInput>, ctx: AgentToolContext) => unknown | Promise<unknown>;
}

/** A map of named tools. */
export type AgentToolSet = Record<string, AgentTool<any>>;

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

export interface AgentConfig {
  /** `provider/model` string resolved through the provider registry. */
  model: ModelString;
  /** System prompt. */
  system?: string;
  /** Static context injected into the system prompt (serialized as JSON snippet). */
  context?: Record<string, unknown>;
  /** Named tools available to the agent. */
  tools?: AgentToolSet;
  /** Max tool-calling steps before the loop stops (default 5). */
  maxSteps?: number;
  /** Sampling temperature (default provider-dependent). */
  temperature?: number;
  /** Max output tokens. */
  maxTokens?: number;
  /** Extra headers forwarded to the provider. */
  headers?: Record<string, string>;
  /** Optional provider override (takes precedence over `model`'s provider). */
  provider?: ProviderDefinition;
}

/** Input to a single agent run. Either a raw prompt or a message list. */
export interface AgentInput {
  /** Single user prompt. */
  prompt?: string;
  /** Full message history (prefer when resuming a conversation). */
  messages?: Array<AgentUserMessage | AgentAssistantMessage>;
  /** Per-run metadata exposed to tools via `AgentToolContext.meta`. */
  meta?: Record<string, unknown>;
}

/** User message shape accepted by the kernel. */
export interface AgentUserMessage {
  role: 'user';
  content: string;
}

/** Assistant message shape accepted by the kernel. */
export interface AgentAssistantMessage {
  role: 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Run results & streaming
// ---------------------------------------------------------------------------

/** Token usage for a run. */
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** A tool call emitted by the model during a run. */
export interface AgentToolCall {
  toolCallId: string;
  toolName: string;
  /** The arguments the model provided for the call. */
  input: Record<string, unknown>;
}

/** Result of a completed tool call. */
export interface AgentToolResult {
  toolName: string;
  toolCallId: string;
  /** Returned value (may be undefined). */
  result?: unknown;
  /** Present when the tool threw. */
  error?: string;
}

/** Result of a non-streaming `run()`. */
export interface AgentRunResult<T = unknown> {
  /** Final assistant text. */
  text: string;
  /** Structured output when the agent is configured with an output schema. */
  output?: T;
  /** Every tool call executed during the run. */
  toolResults: AgentToolResult[];
  /** Token usage. */
  usage?: AgentUsage;
}

/** Discriminated streaming chunk emitted by `stream()`. */
export type AgentStreamChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result?: unknown; error?: string }
  | { type: 'error'; error: string }
  | { type: 'done'; usage?: AgentUsage };

// ---------------------------------------------------------------------------
// Agent instance
// ---------------------------------------------------------------------------

/**
 * The concrete agent returned by `defineAgent`. All orchestration is delegated
 * to the AI SDK (`ToolLoopAgent` / `streamText`); this object only exposes the
 * ubean-idiomatic surface.
 */
export interface UbeanAgent<T = unknown> {
  /** The normalized config this agent was built from. */
  readonly config: AgentConfig;
  /** Run once and await the full result. */
  run(input: AgentInput): Promise<AgentRunResult<T>>;
  /** Stream the run as an async iterable of chunks. */
  stream(input: AgentInput): AsyncIterable<AgentStreamChunk>;
  /**
   * Convert this agent into a Hono handler for an API route. Reads the request
   * body as `AgentInput`, streams the response as SSE. Compatible with
   * `defineHandler` / `defineHandlerMeta` conventions.
   */
  asHandler(): Handler;
}

// ---------------------------------------------------------------------------
// Options & global singleton
// ---------------------------------------------------------------------------

/** Options for `useUbeanAI` / plugin configuration. */
export interface UbeanAIProviderOptions {
  /** Providers to register. */
  providers?: ProviderDefinition[];
  /** Default provider id used when the model string has no provider segment. */
  defaultProvider?: string;
  /** Default model id used when neither the model string nor defaultProvider resolve. */
  defaultModel?: string;
}

/** The global AI kernel singleton. */
export interface UbeanAI {
  /** Register a provider (idempotent by id). */
  defineProvider(definition: ProviderDefinition): UbeanAI;
  /** Resolve a `provider/model` string to a concrete model. */
  resolve(model: ModelString): ResolvedModel;
  /** Build an agent from declarative config. */
  defineAgent<T = unknown>(config: AgentConfig): UbeanAgent<T>;
  /** Build a declarative tool. */
  defineAgentTool<T extends GenericSchema>(tool: AgentTool<T>): AgentTool<T>;
}
