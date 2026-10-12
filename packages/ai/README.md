# @ubean/ai

**English | [中文](./README.zh-CN.md)**

AI large-model integration for the ubean framework — a thin orchestration layer over the Vercel AI SDK.

```ts
import { defineAgent, defineAgentTool, v } from '@ubean/ai';

const weather = defineAgentTool({
  name: 'get_weather',
  description: 'Get the weather for a city',
  input: v.object({ city: v.string() }),
  execute: async ({ city }) => ({ city, temperature: 21 })
});

const agent = defineAgent({ model: 'deepseek-chat', tools: { weather } });
```

## Table of Contents

- [@ubean/ai](#ubeanai)
  - [Package Positioning](#package-positioning)
  - [Install](#install)
  - [Quick Start](#quick-start)
  - [Agent Kernel](#agent-kernel)
  - [Vue Runtime](#vue-runtime)
  - [Gateway Presets](#gateway-presets)
  - [Vite Plugin](#vite-plugin)
  - [Type Safety](#type-safety)
  - [Architecture Notes](#architecture-notes)

## Package Positioning

| Layer                   | Responsibility                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `@ubean/ai` (kernel)    | Provider registry, agent definition, tool definition, streaming chunk protocol      |
| `@ubean/ai/runtime/vue` | Vue composables that consume the SSE stream an agent exposes                        |
| `@ubean/ai/gateway`     | Provider presets only — base URLs and ids for common hosted providers               |
| `@ubean/ai/vite`        | Module wiring: registers providers, auto-imports the composables, adds optimizeDeps |

**Included:**

- `defineProvider` / `configureAI` / `resolveModel` — resolve a `model` string to a concrete provider + model id.
- `defineAgent` — declares system prompt, model, tools, step budget and sampling knobs; returns a `UbeanAgent` with `run()`, `stream()` and `asHandler()`.
- `defineAgentTool` — a type-safe identity helper that keeps the Valibot schema's inferred input type on `execute(args, ctx)`.
- `v` — a namespace re-export of **valibot**, used to author tool input schemas.
- `useChat` / `useAgent` / `useAIProvider` — the Vue runtime.
- Provider presets for DeepSeek, OpenRouter, OmniRoute, OpenAI, Anthropic, Google and Groq.

**NOT included** (deliberately):

- No gateway service. `@ubean/ai/gateway` ships provider _presets_, not routing, fallback or cost optimization — put an external gateway (for example OmniRoute) in front if you need those.
- No UI layer. Markdown rendering, code highlighting and message bubbles are out of scope; pick your own renderer in the `useChat` consumer.
- No agent loop implementation. The tool-calling loop, retries and streaming come from the Vercel AI SDK (`ai`); ubean only declares and orchestrates.
- No HTTP route files. The `asHandler()` result is a plain Hono handler — mount it in `src/routes/` yourself, the way `@ubean/routes` documents API routes.

**Runtime dependency whitelist (main entry):** `@valibot/to-json-schema`, `valibot`. The AI SDK itself (`ai`, `@ai-sdk/openai-compatible`) is loaded lazily.

**Optional peers:** `ai`, `@ai-sdk/openai-compatible`, `hono`, `vite`, `vue`. Every peer is optional — the package builds and imports without them. If the AI SDK is missing when an agent actually runs, the call rejects with an install hint:

```
[@ubean/ai] The AI SDK packages are not installed. Install them with:
pnpm add ai @ai-sdk/openai-compatible (or npm/yarn/bun equivalent).
```

## Install

```bash
# the ubean-side orchestration layer
pnpm add @ubean/ai

# the AI SDK runtime — required at agent execution time
pnpm add ai @ai-sdk/openai-compatible

# peers you only need if you use that part of the surface
pnpm add vue        # @ubean/ai/runtime/vue
pnpm add hono       # UbeanAgent.asHandler()
```

## Quick Start

**1. Enable the module**

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  ai: true // or ai: { defaultProvider: 'deepseek', defaultModel: 'deepseek-chat' }
});
```

**2. Define a tool**

Tool input is a Valibot schema, so `execute` receives a fully inferred argument object.

```ts
// src/server/ai/tools.ts
import { defineAgentTool, v } from '@ubean/ai';

export const searchDocs = defineAgentTool({
  name: 'search_docs',
  description: 'Search the documentation index for a query',
  input: v.object({
    query: v.string(),
    limit: v.optional(v.pipe(v.number(), v.integer()), 5)
  }),
  execute: async ({ query, limit }, ctx) => {
    ctx.signal?.throwIfAborted();
    return { query, limit, hits: [] };
  }
});
```

**3. Define an agent**

```ts
// src/server/ai/agent.ts
import { defineAgent } from '@ubean/ai';
import { searchDocs } from './tools';

export const supportAgent = defineAgent<{ answer: string }>({
  model: 'deepseek-chat',
  system: 'You are a documentation assistant. Cite the docs you used.',
  tools: { searchDocs },
  maxSteps: 5
});
```

**4. Expose it over HTTP**

```ts
// src/routes/api/chat.ts
import { supportAgent } from '~/server/ai/agent';

export const POST = supportAgent.asHandler();
```

`asHandler()` reads the request body as an `AgentInput` and responds with a Server-Sent Events stream of `AgentStreamChunk` frames.

## Agent Kernel

`defineAgent(config)` accepts a model string, a system prompt, a tool set, and optional sampling knobs (`temperature`, `maxTokens`, `headers`, `provider`, `context`). It returns a `UbeanAgent`:

| Member          | Description                                                                              |
| --------------- | ---------------------------------------------------------------------------------------- |
| `config`        | The resolved agent configuration.                                                        |
| `run(input)`    | Await the full result: `{ text, output?, toolResults, usage? }`.                         |
| `stream(input)` | `AsyncIterable<AgentStreamChunk>` — text deltas, tool calls, tool results, errors, done. |
| `asHandler()`   | A Hono `Handler` that streams the agent over SSE.                                        |

Providers are resolved by `model` string. Register one with `defineProvider`, or set a default through `configureAI`:

```ts
import { configureAI, defineProvider, resolveModel } from '@ubean/ai';

defineProvider({
  id: 'my-proxy',
  kind: 'openai-compatible',
  baseURL: 'https://gateway.internal/v1',
  apiKey: process.env.MY_PROXY_KEY,
  modelAliases: { chat: 'deepseek-chat' }
});

configureAI({ defaultProvider: 'my-proxy', defaultModel: 'chat' });

const { provider, modelId } = resolveModel('chat');
```

`defineProvider` is idempotent per `id` and ignores ids containing `/` (those are treated as explicit `provider/model` strings). When no provider matches, `resolveModel` throws:

```
[@ubean/ai] No provider resolved for "<model>". Define a provider via defineProvider() or configure a default with configureAI().
```

If nothing is configured, an environment fallback provider (`id: 'env'`, `kind: 'openai-compatible'`) is used, taking its key from `DEEPSEEK_API_KEY || UBEAN_AI_API_KEY || OPENAI_API_KEY` and its base URL from `UBEAN_AI_API_BASE` (default `https://api.deepseek.com/v1`).

## Vue Runtime

`@ubean/ai/runtime/vue` is a self-built, SSR-safe SSE consumer. It does not depend on `@ai-sdk/vue`.

```ts
import { useChat } from '@ubean/ai/runtime/vue';

const { messages, input, setInput, sendMessage, status, error, isStreaming, abort, reload } = useChat({
  url: '/api/chat'
});
```

| Composable         | Returns                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `useChat(options)` | `{ messages, status, error, input, data, setInput, sendMessage, abort, reload, isStreaming }` |
| `useAgent(agent)`  | `{ isStreaming, error, result, chunks, run, stream }` — drives an in-process `UbeanAgent`     |
| `useAIProvider()`  | `{ defaultProvider?, defaultModel? }` — the runtime provider configuration                    |

`useChat` defaults its `url` to the relative `./chat`, POSTs `{ ...body, messages }`, and parses `AgentStreamChunk` frames into `ChatMessage[]`. Set the runtime provider defaults with `setAIProviderConfig({ defaultProvider, defaultModel })`.

## Gateway Presets

`@ubean/ai/gateway` exports provider definitions you can register directly:

```ts
import { defineProvider } from '@ubean/ai';
import { deepseek, openrouter, allGatewayProviders } from '@ubean/ai/gateway';

for (const provider of allGatewayProviders) defineProvider(provider);
```

| Export       | Provider id  | Base URL                       |
| ------------ | ------------ | ------------------------------ |
| `deepseek`   | `deepseek`   | `https://api.deepseek.com/v1`  |
| `openrouter` | `openrouter` | `https://openrouter.ai/api/v1` |
| `omniRoute`  | `omniroute`  | `http://localhost:8080/v1`     |
| `openai`     | `openai`     | `https://api.openai.com/v1`    |
| `anthropic`  | `anthropic`  | —                              |
| `google`     | `google`     | —                              |
| `groq`       | `groq`       | —                              |

> This subpath provides presets only. It does not implement gateway-level routing, fallback or cost optimization — that belongs to an external gateway such as OmniRoute.

## Vite Plugin

The `ai` field in `ubean.config.ts` wires the module for you. When you need explicit control, use the plugin directly:

```ts
import { ubeanAiPlugin, defineAiConfig } from '@ubean/ai/vite';

export default defineConfig({
  plugins: [ubeanAiPlugin(defineAiConfig({ defaultProvider: 'deepseek' }))]
});
```

The plugin registers the provider presets via `defineProvider`, registers a component resolver for `useChat` / `useAgent` / `useAIProvider` from `@ubean/ai/runtime/vue`, generates `virtual:ubean-ai/runtime`, and adds the runtime packages to `optimizeDeps.include`. It does **not** start a dev gateway proxy.

## Type Safety

- `AgentTool<TInput>` carries the Valibot schema, so `execute(args, ctx)` is inferred from `input` — no casts, no manual generics.
- `defineAgentTool` is an identity function whose only job is to preserve that inference.
- `defineAgent<T>(config)` types `AgentRunResult<T>.output` and `AgentRunResult<T>.text`.
- `AgentStreamChunk` is a discriminated union on `type` (`'text-delta' | 'tool-call' | 'tool-result' | 'error' | 'done'`), so exhaustive switches work in the `stream()` consumer.
- `UbeanAgent.asHandler()` returns a Hono `Handler`, which keeps route typing intact when mounted from `src/routes/`.

## Architecture Notes

- **Thin over the AI SDK.** ubean owns declaration and orchestration; the agent loop, tool-calling protocol and streaming primitives come from `ai`.
- **Lazy AI SDK import.** Missing peers never break the module graph — they fail at execution with an actionable message.
- **`v` is valibot.** The namespace re-export exists so tool schemas and the agent config can come from one import.
- **Streaming protocol is the contract.** `AgentStreamChunk` is what both `stream()` and the Vue runtime speak, which is why `useChat` can consume any agent's SSE endpoint.
- **Rendering is out of scope.** The runtime returns structured messages and chunks; bring your own markdown/code renderer.
- **No gateway implementation.** Presets are data; routing policy stays outside the framework.
