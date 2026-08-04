# ADR-0008 · `@ubean/ai` 包架构：单包多出口 + 薄编排内核

- **状态**: implemented
- **日期**: 2026-08-04
- **关联任务**: grilling 会话（OmniRoute vs Vercel AI SDK 对比 → `@ubean/ai` 封装落地）
- **决策者**: grilling 会话（用户 + 助手）

## 背景

对比了 OmniRoute 与 Vercel AI SDK 两个 AI 生态项目后，得出「两者互补而非竞争」的结论：

- **OmniRoute** = 模型接入/网关层（routing、provider 聚合、成本优化、fallback、token 压缩）。
- **Vercel AI SDK** = 模型消费/开发层（统一 API、流式、tool calling、agent、UI hooks）。

`@ubean/devtools` 已直接依赖 AI SDK（ADR-0004 改为 optionalDeps + 懒加载）。为让 ubean 的**用户页面**也获得 AI 能力，需新增 `@ubean/ai` 扩展包。本 ADR 记录其架构决策。

## 决策

### D1：单包多出口

`@ubean/ai` 采用单包多出口（非多包拆分）：

```
@ubean/ai            # 核心（服务端）：defineAgent / defineAgentTool / provider 解析
@ubean/ai/runtime/vue # 客户端：useChat / useAgent / useAIProvider（SSR 安全）
@ubean/ai/vite       # Vite 插件：配置注入 + 组合式自动导入
@ubean/ai/gateway    # provider 预设（DeepSeek/OpenRouter/OmniRoute/OpenAI/...）
```

理由：符合 ubean 现有扩展包风格（如 `@ubean/auth` 单包多出口）；维护简单、统一版本、一次安装。`ai`/`hono`/`vite`/`vue` 均为 `peerDependencies` + `peerDependenciesMeta.optional`，懒加载 + 清晰报错（延续 ADR-0004 模式）。

### D2：强封装（`defineAgent` + 工具/上下文编排）

用户明确选择方案 B（强封装），而非薄透传。`@ubean/ai` 提供声明式 `defineAgent` / `defineAgentTool`。

### D3：agent 循环委托 AI SDK（B2 边界）

`defineAgent` 的 agent 循环、tool calling、流式**全部委托给 AI SDK**（`streamText`/`generateText` + `stopWhen: stepCountIs(maxSteps)`），`@ubean/ai` 只做**声明式配置层 + ubean 工具注册**。

**不实现**：agent loop、状态持久化、权限系统、审计 —— 这些留给 pi 生态（与 ubean-studio §0.2「不自建 agent loop」决策一致）。`@ubean/ai` 与 pi-agent 可共存：pi 管重型 coding agent，`@ubean/ai` 管应用内轻量 agent。

### D4：`useChat` 自研（非 `@ai-sdk/vue`）

`asHandler()` 输出自有 SSE 协议（`AgentStreamChunk`），复用 `@ai-sdk/vue` 需先做协议转换，得不偿失。故自研轻量 `useChat`（SSE 解析 + 消息状态机，约 100+ 行，SSR 安全），与 `UbeanAgent`/`AgentStreamChunk` 天然契合。

### D5：不集成 markstream-vue（渲染层交给用户）

用户选择 C：`@ubean/ai` 只管状态/传输层，流式 Markdown 渲染交给用户自选库（markstream-vue 等）。`useChat` 只产出消息数据，不渲染。

### D6：gateway 只做 provider 预设（不做网关服务）

用户选择 A：`@ubean/ai/gateway` 仅提供 OpenAI-compatible provider 预设（DeepSeek/OpenRouter/OmniRoute/OpenAI/Anthropic/Google/Groq）。**不实现**网关级能力（routing/fallback/成本优化）——那属于 OmniRoute 等外部网关。OmniRoute 作为 OpenAI-compatible baseURL 被 `@ubean/ai` 消费，不复制其能力。

### D7：Vite 插件（配置注入 + 自动导入）

`@ubean/ai/vite` 提供 `ubeanAiPlugin`：
- **配置注入**：从 `ubean.config.ts` 的 `ai` 字段读取 provider 预设/默认 provider，注入服务端 kernel（`defineProvider`）与客户端 runtime（`setAIProviderConfig`）。
- **自动导入**：注册 resolver，使 `useChat`/`useAgent`/`useAIProvider` 在 SFC 中零 import 使用。
- **不做** dev 网关代理（交给外部网关）。

启用方式：`ubean.config.ts` 中 `ai: true` 或 `ai: { providers, defaultProvider }`。

## 影响面

| 项 | 变更 |
| --- | --- |
| `packages/ai/` | 新增包：`src/{core,types,index,gateway,vite,runtime/vue}.ts` + 构建/类型配置 |
| `packages/modules/src/builtins.ts` | `BUILTIN_MODULES` 新增 `ai` 条目（key/modulePath/factoryExport/pluginName） |
| `packages/config/src/types.ts` | `UbeanConfig`/`ResolvedConfig` 新增 `ai?: boolean \| BuiltinModuleOptions` |
| `packages/config/src/loader.ts` | `configDefaults` 新增 `ai: false` |
| `packages/ai/test/core.test.ts` | 15 个单测（provider 解析/工具定义/gateway 预设） |

## 验收

- `pnpm -F @ubean/ai build` ✅（四子路径产物齐全）
- `pnpm -F @ubean/ai typecheck` ✅
- `pnpm -F @ubean/ai test` ✅（15 passed）
- `pnpm -F @ubean/modules typecheck` ✅、`pnpm -F @ubean/config typecheck` ✅（`ai` 字段接入后）
- 未安装 `ai`/`@ai-sdk/openai-compatible` 时，`@ubean/ai` 可导入但不触发 AI 功能（懒加载 + 清晰报错）。

## 待决/后续

- `@ubean/ai` 尚未写文档/示例（`docs/` 与 playground 未覆盖）。
- `useChat` 的 SSE 端点默认指向 `./chat`，`asHandler()` 已实现，需真实 AI SDK 环境做集成验证。
- 是否将 `@ubean/ai` 接入 `ubean` 聚合包的 re-export（当前为可选扩展，不硬依赖）。