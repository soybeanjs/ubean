# @ubean/preset

**[English](./README.md) | 中文**

ubean 的部署预设：平台探测、能力声明与配置文件生成。

`@ubean/preset` 只回答一个问题 —— _这次构建跑在哪儿？_ —— 并把答案变成产物目录、externals、运行时入口、serve 默认值、能力集，以及（按需生成的）`wrangler.toml` / `vercel.json` / `netlify.toml` / `deno.json` / SAM 模板 / `staticwebapp.config.json`。

```ts
// ubean.config.ts
import { defineConfig } from '@ubean/config';

export default defineConfig({
  // The preset lives under `build` — a top-level `preset` field is silently ignored.
  build: { preset: 'cloudflare' }
});
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [内置预设](#内置预设)
- [预设定义](#预设定义)
- [自动探测](#自动探测)
- [能力矩阵](#能力矩阵)
- [生产缓存存储](#生产缓存存储)
- [配置文件生成器](#配置文件生成器)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

| 本包负责                                                                                               | 归属其他包                                                    |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 11 个内置平台预设、它们的别名与 `extends` 链                                                           | 消费预设的构建流水线 —— `@ubean/build`                        |
| `definePreset` + 预设注册表（`registerPreset`、`resolvePreset`、`getPresetNames`、`getPresetAliases`） | 配置文件加载 —— `@ubean/config`                               |
| 从配置文件、环境变量与运行时全局对象自动探测平台                                                       | 平台配置本身（`wrangler.toml` 里该写什么）—— 本包只**生成**它 |
| 声明式能力集 + `diagnoseCapabilities` / `requireCapability`                                            | 运行时的真实能力探测 —— `@ubean/server`                       |
| `resolveProductionCacheStore`（这个平台上哪种缓存后端能跨重启存活）                                    | 缓存实现 —— `@ubean/server`                                   |

**运行时依赖白名单（主入口）：无。** `@ubean/preset` 是零依赖、零 peer 的叶子包 —— 没有 `@ubean/*`，也没有额外 `node:*`（只有生成器读盘所需的部分）。这是刻意的：构建流水线、CLI 与平台配置生成器都会导入它，它绝不能引入依赖环。

预设回退行为：`resolvePresetByName()` 对未知名称回退到 `standard`（一个 typo 不该炸掉构建），但会 `console.warn` 打印一次已知预设名 —— 静默回退会表现为「一切正常」，直到部署才失败。

## 安装

```bash
pnpm add -D @ubean/preset
```

## 快速开始

```ts
import { resolvePresetByName, resolvePresetWithDetection, registerBuiltinPresets } from '@ubean/preset';

// builtin presets are registered on module load; call this if you register your own first
registerBuiltinPresets();

const preset = resolvePresetByName('cf'); // aliases resolve too
preset.name; // 'cloudflare'
preset.build?.outputDir;
preset.runtime?.entry;

// detection: explicit > config-file > environment > default
const { preset: detected, source, reason } = resolvePresetWithDetection();
// source: 'explicit' | 'config-file' | 'environment' | 'default'
```

`resolvePresetByName` 永不返回 `undefined` —— 它会警告并返回 `standard`。需要严格的 `ResolvedPreset | undefined` 形态时用 `resolvePreset(name)`。

## 内置预设

| 预设             | 别名                                                                 | 继承         | `_meta.stdName`         |
| ---------------- | -------------------------------------------------------------------- | ------------ | ----------------------- |
| `standard`       | `default`                                                            | —            | `standard`              |
| `node`           | `node-server`, `nodedev`                                             | `standard`   | `node`                  |
| `cloudflare`     | `cloudflare-pages`, `cloudflare-module`, `cf`, `wrangler`, `workers` | —            | `cloudflare_workers`    |
| `cloudflare-dev` | `cf-dev`, `wrangler-dev`                                             | `cloudflare` | `cloudflare_workers`    |
| `vercel`         | `vercel-serverless`, `vercel-node`                                   | `node`       | `vercel`                |
| `vercel-edge`    | `vercel-edge-function`                                               | `standard`   | `vercel_edge`           |
| `netlify`        | `netlify-functions`, `netlify-node`                                  | `node`       | `netlify`               |
| `bun`            | `bun-runtime`                                                        | `node`       | `bun`                   |
| `deno`           | `deno-deploy`, `deno-runtime`                                        | `node`       | `deno`                  |
| `aws`            | `aws-lambda`, `lambda`, `amazon`, `sam`                              | `node`       | `aws_lambda`            |
| `azure`          | `azure-swa`, `azure-static-web-apps`, `swa`, `azure-functions`       | `node`       | `azure_static_web_apps` |

```ts
import {
  standardPreset,
  nodePreset,
  cloudflarePreset,
  cloudflareDevPreset,
  vercelPreset,
  vercelEdgePreset,
  netlifyPreset,
  bunPreset,
  denoPreset,
  awsPreset,
  azurePreset,
  resolvePreset,
  getPresetNames,
  getPresetAliases,
  getRegisteredPresets,
  registerPreset,
  listDetectablePresets
} from '@ubean/preset';
```

| 导出                                      | 用途                                                   |
| ----------------------------------------- | ------------------------------------------------------ |
| `standardPreset` … `azurePreset`          | 11 个预设定义，每个都是 `definePreset(...)` 的返回值   |
| `registerPreset(preset, meta?)`           | 注册用户预设（定义里没有 `name` 时由 `meta` 提供）     |
| `resolvePreset(name)`                     | 名称 → `ResolvedPreset \| undefined`（不回退）         |
| `getRegisteredPresets()`                  | 全部已注册定义及其 `_meta`                             |
| `getPresetNames()` / `getPresetAliases()` | `string[]` / `Map<string, string>`（别名 → 规范名）    |
| `registerBuiltinPresets()`                | 幂等地重新注册 11 个内置预设（模块加载时已执行过一次） |
| `listDetectablePresets()`                 | 自动探测可能返回的定义集合                             |

`standard` 是安全基线：无平台专属依赖，`staticServe` + `sse` + streaming，入口 `dist/server/handler.mjs`。`node` 继承它并补齐完整的 Node externals 列表（`mlly`、`rou3`、`scule`、`tinyglobby`、`ofetch`、`@standard-schema/spec` 等）、`server/server.mjs` 入口与 `handler` 导出，以及 `node dist/server/server.mjs` 预览命令。

## 预设定义

```ts
import { definePreset } from '@ubean/preset';

export const myPreset = definePreset(
  {
    extends: 'node',
    build: { outputDir: 'dist/my-platform', format: 'esm' },
    runtime: { entry: 'server/worker.mjs' },
    serve: { host: 'localhost', port: 3000 },
    capabilities: { websocket: false, streaming: true },
    commands: { preview: 'node dist/my-platform/server/worker.mjs' },
    hooks: {
      'build:before': async ctx => {
        ctx.cwd; // string
        ctx.outputDir; // string
        ctx.preset; // ResolvedPreset
        ctx.config; // Record<string, unknown>
      }
    }
  },
  { name: 'my-platform', aliases: ['my'], stdName: 'my_platform' }
);
```

`PresetDefinition` 字段：`name`、`extends`、`entry`、`exportConditions`、`serve`（`host` / `port`）、`build`（`outputDir` / `format` / `externals` / `minify` / `rollupConfig`）、`output`（`dir` / `serverDir` / `publicDir`）、`runtime`（`entry` / `handler` / `compatibilityDate` / `compatibilityFlags`）、`devServer.runner`、`capabilities`、`capabilityInfo`、`hooks`、`alias`、`wasm`、`unenv`、`commands`（`preview` / `deploy`）、`nitro`。

`definePreset(preset, meta?)` 附加 `_meta` 并保证 `name` —— `ResolvedPreset` 即 `PresetDefinition & { name: string; _meta: PresetMeta }`。`PresetMeta` 含 `name`、`aliases`、`stdName`、`static`、`dev`、`compatibilityDate`、`url`。

钩子是唯一的可执行扩展点：`'build:before'`、`'build:after'`、`compiled`（三者都收到 `PresetBuildContext`）与 `'dev:setup'`（`PresetDevContext`）。

`extends` 由注册表解析（`extends: override.extends ?? base.extends`），因此 `myPreset → node → standard` 这样的链会逐级合并。

## 自动探测

```ts
import { detectPreset, resolvePresetWithDetection, listDetectablePresets } from '@ubean/preset';

const result = detectPreset({
  cwd: process.cwd(),
  explicitPreset: 'vercel-edge',
  environment: process.env,
  globalThis: globalThis
});
```

优先级：**explicit > config-file > environment > default**。

1. **explicit** —— `explicitPreset` 能解析时直接胜出。
2. **config-file**（在 `cwd` 下）：
   - `wrangler.toml` / `wrangler.json`，或依赖 `wrangler` / `@cloudflare/workers-types` → `cloudflare`
   - `vercel.json`，或依赖 `vercel` / `@vercel/node` / `@vercel/edge` → `vercel`
   - `netlify.toml`，或依赖 `netlify-cli` / `netlify-lambda` → `netlify`
   - `deno.json` / `deno.jsonc` → `deno`
   - `template.yaml` / `samconfig.toml`，或依赖 `aws-sam-cli` / `aws-cdk` / `@aws-sdk/client-lambda` → `aws`
   - `staticwebapp.config.json`，或依赖 `@azure/static-web-apps-cli` / `@azure/functions` → `azure`
3. **environment** —— `CF_WORKERS` / `WRANGLER` / `CLOUDFLARE_WORKER` → cloudflare；`VERCEL` / `VERCEL_ENV` / `NOW_ID` → vercel；`NETLIFY` / `NETLIFY_DEV` / `NETLIFY_IMAGES_CDN_DOMAIN` → netlify；`AWS_LAMBDA_FUNCTION_NAME` / `AWS_EXECUTION_ENV` / `AWS_LAMBDA_RUNTIME_API` → aws；`AZURE_FUNCTIONS_ENVIRONMENT` / `WEBSITE_SITE_NAME` / `AZURE_HTTP_FUNCTION` → azure。运行时全局对象同样参与：`Deno` → deno，`Bun` / `process.versions.bun` → bun，无 `Deno`/`process` 但有 `CacheStorage` → cloudflare，`process.versions.node` → node。
4. **default** —— `standard`。

每个结果都带 `{ preset, source, reason }`，构建因此可以打印*为什么*选了某个平台，而不是靠猜。

## 能力矩阵

预设以声明方式描述平台，而不是在构建时探测它。

```ts
import {
  createCapabilitySet,
  requireCapability,
  diagnoseCapabilities,
  NODE_CAPABILITIES,
  STANDARD_CAPABILITIES,
  WORKER_CAPABILITIES,
  NODE_REQUIREMENTS,
  DEV_REQUIREMENTS
} from '@ubean/preset';

const result = diagnoseCapabilities('cloudflare', WORKER_CAPABILITIES, [
  requireCapability('database', true, 'This feature needs a database binding')
]);

result.valid; // false
result.errors; // ['[cloudflare] This feature needs a database binding']
result.warnings;
result.diagnostics; // per-capability { capability, supported, required, message }
```

`CapabilityName` 是 `CapabilitySet` 的键联合，共 20 个标志：`staticServe`、`websocket`、`sse`、`cronTriggers`、`queues`、`kv`、`storage`、`database`、`envVars`、`secrets`、`nodeCompat`、`streaming`、`compression`、`https`、`http2`、`middleware`、`bodyLimit`、`multipart`、`rpc`。

| 能力集                            | 特征                                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createCapabilitySet(overrides?)` | 基线：`envVars`、`streaming`、`middleware`、`bodyLimit` 为 true，其余 false                                                                                     |
| `STANDARD_CAPABILITIES`           | `staticServe`、`sse`、`middleware`、`bodyLimit`、`streaming`                                                                                                    |
| `NODE_CAPABILITIES`               | 在基线之上补齐 `websocket`、`cronTriggers`、`queues`、`kv`、`storage`、`database`、`secrets`、`nodeCompat`、`compression`、`https`、`http2`、`multipart`、`rpc` |
| `WORKER_CAPABILITIES`             | `staticServe`、`websocket`、`sse`、`kv`、`envVars`、`streaming`、`middleware`、`bodyLimit` —— 明确**没有** `storage` 与 `nodeCompat`                            |

`requireCapability(capability, required = true, message?)` 构造 `CapabilityRequirement`；`diagnoseCapabilities(presetName, presetCapabilities, requirements)` 返回 `CapabilityDiagnosisResult`（`valid`、`diagnostics`、`errors`、`warnings`、`presetName`）—— 必需且缺失记为 error，可选且缺失记为 warning。`DEV_REQUIREMENTS`（别名 `NODE_REQUIREMENTS`）要求 dev server 具备 `middleware`、`streaming`、`envVars`，并*建议* `staticServe` 与 `nodeCompat`。

`RuntimeTarget`（`'node' | 'worker' | 'browser' | 'deno' | 'bun' | 'edge-light'`）通过 `CapabilityInfo` 为一组标志打标签 —— 后者在全部标志之上加一个 `runtime: RuntimeTarget[]` 字段。

## 生产缓存存储

```ts
import { resolveProductionCacheStore, isEphemeralCachePreset } from '@ubean/preset';

resolveProductionCacheStore('node'); // { store: 'fs', dir: '.ubean/cache' }
resolveProductionCacheStore('cloudflare'); // { store: 'memory' }
resolveProductionCacheStore('node', { store: 'memory' }); // { store: 'memory' } — explicit wins
isEphemeralCachePreset('vercel-edge'); // true
```

`auto`（默认）在类 Node 预设上解析为 `fs`，使缓存 HIT 能跨进程重启存活；在所有 serverless / edge 预设上解析为 `memory` —— 那里本地文件系统不跨 isolate 共享，假装共享会产生静默错误的缓存命中。显式 `{ store: 'fs' | 'memory' }` 始终优先于 `auto`。

临时（ephemeral）名称集合：`cloudflare`、`cloudflare-pages`、`cloudflare-module`、`cf`、`wrangler`、`workers`、`cloudflare-dev`、`cf-dev`、`wrangler-dev`、`vercel`、`vercel-serverless`、`vercel-node`、`vercel-edge`、`vercel-edge-function`、`netlify`、`netlify-functions`、`netlify-node`、`aws`、`azure`。

## 配置文件生成器

```ts
import {
  generateWranglerConfig,
  serializeWranglerToml,
  generateVercelConfig,
  serializeVercelConfig,
  generateNetlifyConfig,
  serializeNetlifyConfig,
  generateBunfigConfig,
  serializeBunfigConfig,
  generateDenoConfig,
  serializeDenoConfig,
  generateAwsSamConfig,
  serializeAwsSamConfig,
  generateStaticWebAppConfig,
  serializeStaticWebAppConfig
} from '@ubean/preset';

const wrangler = generateWranglerConfig({
  name: 'my-app',
  compatibilityFlags: ['nodejs_compat'],
  kvNamespaces: [{ binding: 'KV', id: '...' }],
  d1Databases: [{ binding: 'DB', databaseId: '...' }],
  r2Buckets: [{ binding: 'BUCKET', bucketName: 'my-bucket' }]
});
const toml = serializeWranglerToml(wrangler);
```

| 生成器                       | 自动填充的默认值                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateWranglerConfig`     | `main: 'dist/cloudflare/worker/index.mjs'`、`compatibility_date: '2024-09-01'`、`compatibility_flags: ['nodejs_compat']`、`workers_dev: true` |
| `generateVercelConfig`       | `version: 2`，入口 `dist/vercel/server/index.mjs` 映射为 function，`memory: 1024`                                                             |
| `generateNetlifyConfig`      | `build.command: 'pnpm build'`、`publish: 'dist/netlify/public'`、functions 目录 `dist/netlify/functions`                                      |
| `generateBunfigConfig`       | `install` 段（registry / lockfile / production）+ `preload`                                                                                   |
| `generateDenoConfig`         | `tasks`、`importMap`、`lock`、`nodeModulesDir`、`unstable`                                                                                    |
| `generateAwsSamConfig`       | `handler: 'dist/aws/lambda/index.handler'`、runtime `nodejs20.x`、`codeUri: 'dist/aws/lambda'`                                                |
| `generateStaticWebAppConfig` | `apiEntry`、`routes`、`navigationFallback`、`globalHeaders`、`apiRuntime`                                                                     |

每个 `generate*` 返回带类型的对象（`WranglerConfig`、`VercelConfig`、`NetlifyConfig`、`BunfigConfig`、`DenoConfig`、`AwsSamTemplate`、`StaticWebAppConfig`）；对应的 `serialize*` 负责落盘（`AwsSamTemplate` 内含 `AwsSamResource` 条目）。

## 类型安全

- `definePreset` 返回 `P & { _meta: PresetMeta; name: string }`，用户预设保留字面量形态的同时满足 `ResolvedPreset`。
- `Preset = PresetDefinition | (() => PresetDefinition)` —— 预设可以是惰性工厂；`ResolvedPreset extends PresetDefinition`，保证 `name` 与 `_meta` 存在。
- `PresetDetectionResult.source` 是字面量联合 `'explicit' | 'config-file' | 'environment' | 'default'`，穷尽分支由编译器检查。
- `CapabilityName`、`CapabilitySet`、`CapabilityInfo`、`CapabilityRequirement`、`CapabilityDiagnostic`、`CapabilityDiagnosisResult`、`RuntimeTarget` 为整个能力面提供类型。

## 架构说明

- **零依赖、零 peer。** 本包刻意做叶子 —— `@ubean/build`、`@ubean/cli`、`@ubean/config` 都导入它，任何依赖都会成环。
- **注册发生在模块加载时。** `src/index.ts` 在 import 时调用 `registerBuiltinPresets()`；导出该函数是为了测试与重新注册。
- **别名是独立表。** `getPresetAliases()` 映射别名 → 规范名；`resolvePresetByName` 先查它再调 `resolvePreset`，而 `resolvePreset` 本身是严格的。
- **未知名称警告而不抛错。** 回退到 `standard` 让 typo 不至于炸掉构建，警告则让 typo 不至于悄悄进生产。
- **探测是纯函数。** `detectPreset` 把 `cwd` / `environment` / `globalThis` 作为 hints（默认取真实值），因此无需改动进程状态即可测试。
