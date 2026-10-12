# @ubean/ai

**[English](./README.md) | 中文**

ubean 框架的 AI 大模型集成 —— 一层薄编排，底层是 Vercel AI SDK。

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

## 目录

- [@ubean/ai](#ubeanai)
  - [包定位](#包定位)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [Agent 内核](#agent-内核)
  - [Vue 运行时](#vue-运行时)
  - [Gateway 预设](#gateway-预设)
  - [Vite 插件](#vite-插件)
  - [类型安全](#类型安全)
  - [架构说明](#架构说明)

## 包定位

| 分层                    | 职责                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `@ubean/ai`（内核）     | provider 注册表、agent 定义、工具定义、流式 chunk 协议          |
| `@ubean/ai/runtime/vue` | 消费 agent 暴露的 SSE 流的 Vue composable                       |
| `@ubean/ai/gateway`     | 仅提供 provider 预设 —— 常见托管服务的 base URL 与 id           |
| `@ubean/ai/vite`        | 模块接线：注册 provider、自动导入 composable、补 `optimizeDeps` |

**包含：**

- `defineProvider` / `configureAI` / `resolveModel` —— 把 `model` 字符串解析为具体的 provider + model id。
- `defineAgent` —— 声明 system prompt、model、工具集、步数预算与采样参数；返回带 `run()`、`stream()`、`asHandler()` 的 `UbeanAgent`。
- `defineAgentTool` —— 类型安全的恒等辅助函数，让 Valibot schema 推导出的输入类型保留到 `execute(args, ctx)` 上。
- `v` —— **valibot** 的命名空间重导出，用于编写工具输入 schema。
- `useChat` / `useAgent` / `useAIProvider` —— Vue 运行时。
- DeepSeek、OpenRouter、OmniRoute、OpenAI、Anthropic、Google、Groq 的 provider 预设。

**不包含**（刻意为之）：

- 不提供网关服务。`@ubean/ai/gateway` 给的是 provider _预设_，不是路由、回退或成本优化 —— 需要这些能力请在前面接外部网关（例如 OmniRoute）。
- 不含 UI 层。Markdown 渲染、代码高亮、消息气泡都不在本包范围内；在 `useChat` 的消费侧自选渲染器。
- 不实现 agent 循环。工具调用循环、重试与流式原语来自 Vercel AI SDK（`ai`）；ubean 只负责声明与编排。
- 不生成 HTTP 路由文件。`asHandler()` 的结果就是一个普通 Hono handler —— 由你挂到 `src/routes/`，与 `@ubean/routes` 记录的 API 路由写法一致。

**运行时依赖白名单（主入口）：** `@valibot/to-json-schema`、`valibot`。AI SDK 本体（`ai`、`@ai-sdk/openai-compatible`）为懒加载。

**可选 peer：** `ai`、`@ai-sdk/openai-compatible`、`hono`、`vite`、`vue`。所有 peer 均为可选 —— 缺少它们时包依然能构建和导入。若 agent 真正执行时 AI SDK 缺失，调用会带安装提示直接 reject：

```
[@ubean/ai] The AI SDK packages are not installed. Install them with:
pnpm add ai @ai-sdk/openai-compatible (or npm/yarn/bun equivalent).
```

## 安装

```bash
# ubean 侧的编排层
pnpm add @ubean/ai

# AI SDK 运行时 —— agent 执行时必需
pnpm add ai @ai-sdk/openai-compatible

# 只在用到对应能力时才需要的 peer
pnpm add vue        # @ubean/ai/runtime/vue
pnpm add hono       # UbeanAgent.asHandler()
```

## 快速开始

**1. 启用模块**

```ts
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  ai: true // 或 ai: { defaultProvider: 'deepseek', defaultModel: 'deepseek-chat' }
});
```

**2. 定义工具**

工具输入是 Valibot schema，因此 `execute` 收到的参数对象类型是完整推导出来的。

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

**3. 定义 agent**

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

**4. 通过 HTTP 暴露**

```ts
// src/routes/api/chat.ts
import { supportAgent } from '~/server/ai/agent';

export const POST = supportAgent.asHandler();
```

`asHandler()` 把请求体读作 `AgentInput`，并以 Server-Sent Events 流的形式返回 `AgentStreamChunk` 帧。

## Agent 内核

`defineAgent(config)` 接受 model 字符串、system prompt、工具集，以及可选的采样参数（`temperature`、`maxTokens`、`headers`、`provider`、`context`）。返回的 `UbeanAgent`：

| 成员            | 说明                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| `config`        | 解析后的 agent 配置。                                                           |
| `run(input)`    | 等待完整结果：`{ text, output?, toolResults, usage? }`。                        |
| `stream(input)` | `AsyncIterable<AgentStreamChunk>` —— 文本增量、工具调用、工具结果、错误、结束。 |
| `asHandler()`   | 通过 SSE 流式输出该 agent 的 Hono `Handler`。                                   |

provider 由 `model` 字符串解析。用 `defineProvider` 注册，或用 `configureAI` 设置默认值：

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

`defineProvider` 按 `id` 幂等，并会忽略含 `/` 的 id（这类字符串被当作显式的 `provider/model`）。没有匹配到 provider 时，`resolveModel` 抛出：

```
[@ubean/ai] No provider resolved for "<model>". Define a provider via defineProvider() or configure a default with configureAI().
```

若完全未配置，则使用环境变量回退 provider（`id: 'env'`、`kind: 'openai-compatible'`）：密钥取自 `DEEPSEEK_API_KEY || UBEAN_AI_API_KEY || OPENAI_API_KEY`，base URL 取自 `UBEAN_AI_API_BASE`（默认 `https://api.deepseek.com/v1`）。

## Vue 运行时

`@ubean/ai/runtime/vue` 是自研的、SSR 安全的 SSE 消费者，不依赖 `@ai-sdk/vue`。

```ts
import { useChat } from '@ubean/ai/runtime/vue';

const { messages, input, setInput, sendMessage, status, error, isStreaming, abort, reload } = useChat({
  url: '/api/chat'
});
```

| Composable         | 返回值                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `useChat(options)` | `{ messages, status, error, input, data, setInput, sendMessage, abort, reload, isStreaming }` |
| `useAgent(agent)`  | `{ isStreaming, error, result, chunks, run, stream }` —— 驱动进程内的 `UbeanAgent`            |
| `useAIProvider()`  | `{ defaultProvider?, defaultModel? }` —— 运行时 provider 配置                                 |

`useChat` 的 `url` 默认是相对路径 `./chat`，POST `{ ...body, messages }`，并把 `AgentStreamChunk` 帧解析为 `ChatMessage[]`。运行时 provider 默认值通过 `setAIProviderConfig({ defaultProvider, defaultModel })` 设置。

## Gateway 预设

`@ubean/ai/gateway` 导出的 provider 定义可直接注册：

```ts
import { defineProvider } from '@ubean/ai';
import { deepseek, openrouter, allGatewayProviders } from '@ubean/ai/gateway';

for (const provider of allGatewayProviders) defineProvider(provider);
```

| 导出         | provider id  | Base URL                       |
| ------------ | ------------ | ------------------------------ |
| `deepseek`   | `deepseek`   | `https://api.deepseek.com/v1`  |
| `openrouter` | `openrouter` | `https://openrouter.ai/api/v1` |
| `omniRoute`  | `omniroute`  | `http://localhost:8080/v1`     |
| `openai`     | `openai`     | `https://api.openai.com/v1`    |
| `anthropic`  | `anthropic`  | —                              |
| `google`     | `google`     | —                              |
| `groq`       | `groq`       | —                              |

> 该子路径只提供预设。它不实现网关级的路由、回退或成本优化 —— 那些属于外部网关（如 OmniRoute）。

## Vite 插件

`ubean.config.ts` 里的 `ai` 字段会替你完成接线。需要显式控制时直接使用插件：

```ts
import { ubeanAiPlugin, defineAiConfig } from '@ubean/ai/vite';

export default defineConfig({
  plugins: [ubeanAiPlugin(defineAiConfig({ defaultProvider: 'deepseek' }))]
});
```

插件会通过 `defineProvider` 注册 provider 预设，为来自 `@ubean/ai/runtime/vue` 的 `useChat` / `useAgent` / `useAIProvider` 注册组件解析器，生成 `virtual:ubean-ai/runtime`，并把运行时包加入 `optimizeDeps.include`。它**不会**启动 dev 网关代理。

## 类型安全

- `AgentTool<TInput>` 携带 Valibot schema，因此 `execute(args, ctx)` 的参数由 `input` 推导 —— 无需断言，也无需手写泛型。
- `defineAgentTool` 是恒等函数，唯一职责就是保留这份推导。
- `defineAgent<T>(config)` 为 `AgentRunResult<T>.output` 与 `AgentRunResult<T>.text` 提供类型。
- `AgentStreamChunk` 是按 `type` 判别的联合类型（`'text-delta' | 'tool-call' | 'tool-result' | 'error' | 'done'`），因此 `stream()` 消费侧可以做穷尽分支。
- `UbeanAgent.asHandler()` 返回 Hono `Handler`，从 `src/routes/` 挂载时路由类型保持完整。

## 架构说明

- **薄封装 AI SDK。** ubean 负责声明与编排；agent 循环、工具调用协议与流式原语来自 `ai`。
- **AI SDK 懒加载。** 缺少 peer 不会破坏模块图 —— 只会在执行时以可操作的提示失败。
- **`v` 就是 valibot。** 命名空间重导出让工具 schema 与 agent 配置来自同一次 import。
- **流式协议即契约。** `AgentStreamChunk` 是 `stream()` 与 Vue 运行时共同使用的语言，`useChat` 因此能消费任意 agent 的 SSE 端点。
- **渲染不在范围内。** 运行时返回结构化的消息与 chunk；markdown/代码渲染器由你自备。
- **不实现网关。** 预设只是数据；路由策略留在框架之外。
