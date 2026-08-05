/**
 * `@ubean/ai` kernel.
 *
 * Thin orchestration over the Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`).
 * The agent loop, tool-calling protocol and streaming are delegated to the AI
 * SDK; this module only provides the ubean-idiomatic configuration surface
 * (`defineAgent` / `defineAgentTool`), provider resolution and the SSE handler
 * used by `useChat`.
 *
 * `ai` and `@ai-sdk/openai-compatible` are optional peerDependencies and are
 * loaded lazily here (ADR-0004 pattern), so the package degrades gracefully
 * with a clear install error when they are missing.
 */
import type { Handler } from 'hono';
import { safeParse } from 'valibot';
import { toJsonSchema } from '@valibot/to-json-schema';
import type {
  AgentConfig,
  AgentInput,
  AgentRunResult,
  AgentStreamChunk,
  AgentTool,
  AgentToolContext,
  AgentToolResult,
  ProviderDefinition,
  ResolvedModel,
  UbeanAgent
} from './types';

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const registeredProviders = new Map<string, ProviderDefinition>();
let defaultProviderId: string | undefined;

/** Register a provider (idempotent by id). */
export function defineProvider(definition: ProviderDefinition): void {
  if (definition.id && !definition.id.includes('/')) {
    registeredProviders.set(definition.id, definition);
  }
}

/** Configure the fallback provider used when a model string has no provider segment. */
export function configureAI(options: { defaultProvider?: string }): void {
  if (options.defaultProvider) defaultProviderId = options.defaultProvider;
}

/** Internal: clear registered providers & default (used by tests). */
export function resetAIState(): void {
  registeredProviders.clear();
  defaultProviderId = undefined;
}

/**
 * Resolve a `provider/model` string to `{ provider, modelId }`.
 * Falls back to the configured default provider, then to an env-driven
 * OpenAI-compatible provider (mirrors devtools' DeepSeek defaults).
 */
export function resolveModel(model: string): ResolvedModel {
  const slash = model.indexOf('/');
  const providerId = slash === -1 ? undefined : model.slice(0, slash);
  const modelId = slash === -1 ? model : model.slice(slash + 1);

  let provider = providerId ? registeredProviders.get(providerId) : undefined;
  if (!provider && defaultProviderId) {
    provider = registeredProviders.get(defaultProviderId);
  }
  if (!provider) {
    provider = envProvider();
  }
  if (!provider) {
    throw new Error(
      `[@ubean/ai] No provider resolved for "${model}". Define a provider via defineProvider() or configure a default with configureAI().`
    );
  }
  return { provider, modelId };
}

function envProvider(): ProviderDefinition | undefined {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.UBEAN_AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = process.env.UBEAN_AI_API_BASE || 'https://api.deepseek.com/v1';
  if (!apiKey) return undefined;
  return {
    id: 'env',
    kind: 'openai-compatible',
    baseURL,
    apiKey
  };
}

// ---------------------------------------------------------------------------
// Tool helpers
// ---------------------------------------------------------------------------

/** Declare a typed ubean tool. Returns the tool unchanged (type-safe identity). */
export function defineAgentTool<T extends AgentTool['input']>(tool: AgentTool<T>): AgentTool<T> {
  return tool;
}

// ---------------------------------------------------------------------------
// AI SDK wiring (lazy loading)
// ---------------------------------------------------------------------------

async function loadAiSdk() {
  try {
    const [aiMod, compatMod] = await Promise.all([import('ai'), import('@ai-sdk/openai-compatible')]);
    return {
      ai: aiMod,
      createOpenAICompatible: compatMod.createOpenAICompatible
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[@ubean/ai] The AI SDK packages are not installed. Install them with: ` +
        `pnpm add ai @ai-sdk/openai-compatible (or npm/yarn/bun equivalent). Original error: ${msg}`,
      { cause: err }
    );
  }
}

function buildSystemPrompt(config: AgentConfig): string {
  let system = config.system ?? '';
  if (config.context && Object.keys(config.context).length > 0) {
    const ctx = JSON.stringify(config.context, null, 2);
    system += `\n\n<context>\n${ctx}\n</context>`;
  }
  return system;
}

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

/**
 * Build a declarative agent. The loop is delegated to the AI SDK's
 * `streamText`/`generateText` (with `stopWhen: stepCountIs(maxSteps)`); this
 * only returns the ubean-idiomatic surface (`run`/`stream`/`asHandler`).
 */
export function defineAgent<T = unknown>(config: AgentConfig): UbeanAgent<T> {
  const system = buildSystemPrompt(config);

  async function createModel() {
    const { ai, createOpenAICompatible } = await loadAiSdk();
    const { provider, modelId } = resolveModel(config.model);
    const providerFactory = createOpenAICompatible({
      baseURL: provider.baseURL,
      name: provider.id,
      apiKey: provider.apiKey,
      headers: provider.headers
    });
    return {
      ai,
      model: providerFactory.chatModel(modelId),
      provider
    };
  }

  async function buildTools(input: AgentInput): Promise<Record<string, any>> {
    const { ai } = await loadAiSdk();
    const tools: Record<string, any> = {};
    for (const [name, tool] of Object.entries(config.tools ?? {})) {
      const toolName = tool.name || name;
      // Convert the valibot schema to an AI SDK Schema: JSON Schema (for the
      // model) + a valibot safeParse validator (for runtime arg validation).
      const inputSchema = ai.jsonSchema(toJsonSchema(tool.input), {
        validate: value => {
          const result = safeParse(tool.input, value);
          if (result.success) {
            return { success: true, value: result.output };
          }
          return { success: false, error: new Error(result.issues.map(i => i.message).join('; ')) };
        }
      });
      tools[toolName] = ai.tool({
        description: tool.description,
        inputSchema,
        execute: async (args: unknown, ctx: { toolCallId?: string; abortSignal?: AbortSignal }) => {
          const toolCtx: AgentToolContext = {
            runId: (input.meta?.runId as string | undefined) ?? 'run',
            meta: input.meta,
            signal: ctx.abortSignal
          };
          try {
            return await tool.execute(args as never, toolCtx);
          } catch (err) {
            throw err instanceof Error ? err : new Error(String(err));
          }
        }
      });
    }
    return tools;
  }

  function toCoreMessages(input: AgentInput): Array<{ role: 'user' | 'assistant'; content: string }> {
    if (input.messages) return input.messages;
    return input.prompt ? [{ role: 'user', content: input.prompt }] : [];
  }

  async function run(input: AgentInput): Promise<AgentRunResult<T>> {
    const { ai, model } = await createModel();
    const tools = await buildTools(input);
    const messages = toCoreMessages(input);

    const result = await ai.generateText({
      model,
      system,
      messages,
      tools,
      stopWhen: ai.stepCountIs(config.maxSteps ?? 5),
      maxOutputTokens: config.maxTokens,
      temperature: config.temperature,
      headers: config.headers
    });

    const toolResults: AgentToolResult[] = (result.toolResults ?? []).map(tr => ({
      toolName: tr.toolName,
      toolCallId: tr.toolCallId,
      result: tr.output as unknown
    }));

    return {
      text: result.text,
      output: result.output as T | undefined,
      toolResults,
      usage: result.usage
        ? {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            totalTokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)
          }
        : undefined
    };
  }

  async function* stream(input: AgentInput): AsyncGenerator<AgentStreamChunk> {
    const { ai, model } = await createModel();
    const tools = await buildTools(input);
    const messages = toCoreMessages(input);

    const result = ai.streamText({
      model,
      system,
      messages,
      tools,
      stopWhen: ai.stepCountIs(config.maxSteps ?? 5),
      maxOutputTokens: config.maxTokens,
      temperature: config.temperature,
      headers: config.headers
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          yield { type: 'text-delta', text: part.text };
          break;
        case 'tool-call':
          yield {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input as Record<string, unknown>
          };
          break;
        case 'tool-result':
          yield {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.output as unknown
          };
          break;
        case 'error': {
          const error = part.error instanceof Error ? part.error.message : String(part.error);
          yield { type: 'error', error };
          return;
        }
        case 'finish': {
          const finish = part as { usage?: { inputTokens?: number; outputTokens?: number } };
          yield {
            type: 'done',
            usage: finish.usage
              ? {
                  inputTokens: finish.usage.inputTokens ?? 0,
                  outputTokens: finish.usage.outputTokens ?? 0,
                  totalTokens: (finish.usage.inputTokens ?? 0) + (finish.usage.outputTokens ?? 0)
                }
              : undefined
          };
          return;
        }
      }
    }
  }

  /**
   * Convert this agent into a Hono handler. Reads the request body as
   * `AgentInput` and streams the result as SSE (`data: <json>\n\n`), directly
   * compatible with `useChat`'s SSE parser.
   */
  function asHandler(): Handler {
    return async c => {
      const input = await c.req.json<AgentInput>().catch(() => ({}) as AgentInput);
      const { streamSSE } = await import('hono/streaming');
      return streamSSE(c, async sse => {
        for await (const chunk of stream(input)) {
          await sse.writeSSE({
            data: JSON.stringify(chunk)
          });
        }
      });
    };
  }

  return { config, run, stream, asHandler };
}

// Re-export types for convenience.
export type {
  AgentConfig,
  AgentInput,
  AgentRunResult,
  AgentStreamChunk,
  AgentTool,
  AgentToolResult,
  ProviderDefinition,
  ProviderKind,
  ResolvedModel,
  UbeanAgent
} from './types';
