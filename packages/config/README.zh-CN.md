# @ubean/config

**[English](./README.md) | 中文**

ubean 的配置加载器、类型与模块系统。

`@ubean/config` 拥有 `ubean.config.ts`：负责加载与解析它、实例化内建模块系统（`icon` / `pwa` / `auth` / `image` / `fonts` / `electron` / `ui` / `pinia` / `ai` / `content`），并把解析结果展开成一份「项目必须安装哪些第三方包」的机器可读清单。

```ts
// ubean.config.ts
import { defineConfig } from '@ubean/config';

export default defineConfig({
  srcDir: 'src',
  routing: { mode: 'virtual' },
  // The platform preset lives under `build` — a top-level `preset` field is ignored.
  build: { preset: 'node' }
});
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [配置加载](#配置加载)
- [内建模块系统](#内建模块系统)
- [项目依赖清单](#项目依赖清单)
- [包管理器工具](#包管理器工具)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

| 本包负责                                                                                                            | 归属其他包                                                         |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `ubean.config.ts` 的加载与解析：`defineConfig`、`loadUbeanConfig`、`ensureUbeanConfig`、`getConfig`、`tryGetConfig` | CLI 入口与命令装配 —— `@ubean/cli`                                 |
| 配置域解析器：routing、i18n、SSR、prerender、DevTools、favicon、logging                                             | 对应能力本体 —— `@ubean/vue`、`@ubean/i18n`、`@ubean/build`        |
| 模块系统：`resolveModules` / `defineModule` / `ModuleKitContext` + 内建模块表                                       | 模块实现 —— `@ubean/icon`、`@ubean/ai`、`@ubean/integrations`（…） |
| 供 `ubean prepare` 与 Vite 插件 `config` 钩子共用的项目依赖清单                                                     | 平台能力探测 —— `@ubean/preset`                                    |

**运行时依赖白名单（主入口）：`@ubean/shared`**，外加加载栈（`c12`、`defu`、`hookable`、`jiti`、`pathe`）。本包是 Node-only 的构建期包，不承诺无 `node:*`。

可选 peer —— `@ubean/content`、`hono`、`vite` —— 三者均为 `peerDependenciesMeta.optional`。它们只用于类型与 module-kit 上下文；缺失时内建模块的 `kit.addServerHandler` / `kit.addVitePlugin` 会失去具体类型，但加载器仍可工作。

## 安装

```bash
pnpm add -D @ubean/config
# optional peers, only when you use the corresponding capability:
pnpm add -D vite
pnpm add hono
pnpm add @ubean/content
```

## 快速开始

```ts
import { loadUbeanConfig, getConfig } from '@ubean/config';

const config = await loadUbeanConfig(process.cwd()); // resolves + caches
const same = getConfig(); // throws if nothing was loaded yet
```

配置文件解析交给 `c12`：优先 `ubean.config.{ts,js,mjs,cjs,mts,cts}`，其次 `.ubeanrc`，`name: 'ubean'`。需要同步读取的场景（在 `vite.config.ts` 中同步调用的 Vite 插件工厂）用 `loadUbeanConfigSync()` —— CLI 已加载过时直接命中缓存，否则用 jiti 求值配置文件。

> 平台预设写在 `build: { preset: 'node' }`。**没有**顶层 `preset` 字段：写了会被静默忽略，产物仍按 `standard` 预设产出。详见 `@ubean/preset`。

## 配置加载

```ts
import {
  loadUbeanConfig, // async, c12-based, populates the cache
  loadUbeanConfigSync, // sync, jiti-based; cache first
  ensureUbeanConfig, // cache first, otherwise load
  getConfig, // cache or throw
  tryGetConfig, // cache or null
  resolveRoutingConfig, // { mode, outputDir, routeLazy, layoutLazy }
  resolveI18nConfig, // i18n defaults + locale list
  resolveSsrConfig, // boolean | { all, exclude, streaming } → resolved
  resolvePrerenderConfig, // include/exclude + DEFAULT_PRERENDER_EXCLUDE
  resolveDevToolsConfig,
  resolveLoggingConfig,
  resolveFavicon
} from '@ubean/config';
```

| 解析器                                 | 说明                                                                                                                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveRoutingConfig(userConfig?)`    | 合并到 `routingConfigDefaults`（`mode: 'virtual'`、`outputDir: 'src/router/_generated'`、`routeLazy: true`、`layoutLazy: true`）。函数字段（`getRouteMeta` / `onGenerated`）不参与 spread。`warnUnknownRoutingKeys(userConfig)` 对已删除或拼错的 `routing` 字段告警。 |
| `resolveI18nConfig(config?)`           | 接受 `I18nConfig \| false`；`localeCodesOf(resolved)` 返回语言码列表。                                                                                                                                                                                                |
| `resolveSsrConfig(config?)`            | 归一化 `boolean \| SsrOptions`；`all` 默认 `true`。                                                                                                                                                                                                                   |
| `resolvePrerenderConfig(config?)`      | `DEFAULT_PRERENDER_EXCLUDE` = `['/api/**', '/_**', '/robots.txt', '/sitemap.xml', '/favicon.ico', '/favicon.svg', '/manifest.webmanifest']`。                                                                                                                         |
| `resolveLoggingConfig(config?, mode?)` | 应用按模式决定的默认闸门（`ssg` / `spa` 下 `request: 'auto'` 强制关闭）。                                                                                                                                                                                             |
| `resolveFavicon(favicon, publicDir)`   | `boolean \| string \| undefined` → 路径或 `null`。                                                                                                                                                                                                                    |

## 内建模块系统

模块是扩展缝。一个模块可以是字符串包名、`[factory, options]` 元组、裸 Vite 插件，或 `ModuleDefinition` 对象。

```ts
import { defineModule, resolveModules } from '@ubean/config';

export const myModule = defineModule({
  name: 'ubean:my-module',
  dependsOn: ['ubean:icon'],
  setup(options, kit) {
    kit.addVirtualImports({
      imports: [{ name: 'myHelper', from: 'my-pkg/helpers' }]
    });
    kit.addAutoImport({ imports: ['useMyThing'], from: 'my-pkg/runtime' });
    kit.addServerHandler({ route: '/_my', handler: c => c.json({ ok: true }) });
  }
});

const { plugins, modules, hooks, serverHandlers, devServerHandlers, devToolsTabs } = await resolveModules({
  cwd: process.cwd(),
  config,
  builtinPlugins: []
});
```

`setup(options, kit)` 收到的 `ModuleKitContext`（由 `createModuleKitContext(moduleName, options)` 构造）：

| `kit` 成员                      | 用途                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `hooks.hook` / `hooks.callHook` | 订阅 `ModuleHooks`（`app:created`、`build:before`、`dev:setup`、`request:start` 等） |
| `addServerHandler`              | 注册 Hono 处理器（`ServerHandlerRegistration`）                                      |
| `addDevServerHandler`           | 注册仅 dev 的处理器（`DevServerHandlerRegistration`）                                |
| `addVitePlugin`                 | 推入一个或多个 Vite 插件                                                             |
| `addVirtualImports`             | 注册 `virtual:ubean-*` 导入                                                          |
| `addComponentsDir`              | 注册组件自动引入目录                                                                 |
| `addAutoImport`                 | 注册自动引入符号                                                                     |
| `addDevToolsTab`                | 注册自定义 DevTools 标签页                                                           |

`resolveModules` 按 `dependsOn` 拓扑排序（`topologicalSort`），始终在最前插入核心模块（`__ubean_core__`，承载 `builtinPlugins`），并用 `hookable` 返回 `hooks`。未知/成环依赖被追加而非丢弃。

内建模块表把配置键映射到实现它的包：

```ts
import { BUILTIN_MODULES, getBuiltinModuleByKey, extractBuiltinOptions, isBuiltinDisabled } from '@ubean/config';

getBuiltinModuleByKey('icon'); // { key: 'icon', modulePath: '@ubean/icon/vite', factoryExport: 'ubeanIconPlugin', pluginName: 'ubean:icon' }
extractBuiltinOptions({ disabled: false, dir: 'icons' }); // { dir: 'icons' } — `disabled` is stripped
isBuiltinDisabled(false); // true
```

| Key        | 模块路径                       | 插件             |
| ---------- | ------------------------------ | ---------------- |
| `content`  | `@ubean/content/vite`          | `ubean:content`  |
| `icon`     | `@ubean/icon/vite`             | `ubean:icon`     |
| `pwa`      | `@ubean/integrations/pwa`      | `ubean:pwa`      |
| `auth`     | `@ubean/auth/vite`             | `ubean:auth`     |
| `image`    | `@ubean/image/vite`            | `ubean:image`    |
| `fonts`    | `@ubean/integrations/fonts`    | `ubean:fonts`    |
| `electron` | `@ubean/integrations/electron` | `ubean:electron` |
| `ui`       | `@ubean/integrations/ui`       | `ubean:ui`       |
| `pinia`    | `@ubean/integrations/pinia`    | `ubean:pinia`    |
| `ai`       | `@ubean/ai/vite`               | `ubean:ai`       |

当用户 `modules` 数组里已包含同一个包 / 工厂 / 插件名时，内建模块会被**跳过** —— `resolveModules` 去重而非重复加载。

手写模块列表时可用的辅助函数：`isModuleDefinition`、`isVitePlugin`、`getModuleKey`、`getModuleName`、`extractPlugins`、`extractPackageName`、`extractMissingPackageName`。最后这个值得留意：它从模块加载错误里抠出**真正缺失**的包名，于是「装了 `@ubean/integrations` 但缺 `@vean/ui`」的项目会被提示装 `@vean/ui`，而不是它已经装了的模块包。

## 项目依赖清单

ubean 把若干第三方包声明为**可选 peer**，让项目只为开启的能力付费。缺失的 peer 会静默降级 —— 这正是本包要提供一份「哪个能力需要哪个包」机器可读清单的原因。

```ts
import { resolveConfigDependencies, findMissingProjectDependencies, checkProjectDependencies } from '@ubean/config';

const resolved = resolveConfigDependencies(config, { core: true, ogImage: false });
const missing = findMissingProjectDependencies(process.cwd(), resolved);

const result = await checkProjectDependencies({
  cwd: process.cwd(),
  config,
  mode: 'prompt', // 'prompt' asks on a TTY and installs; 'warn' only prints
  once: true // skip repeated checks in one process (default)
});
```

| 导出                                                                    | 用途                                                                                                 |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `CORE_PROJECT_DEPENDENCIES`                                             | 任何 ubean 项目都必须声明的包（模板/样式侧，如 `vue-i18n`、`vue-router`），尽管 ubean 自身也依赖它们 |
| `resolveSelectedCapabilities(config, probes)`                           | 配置 → 被选中的内建 key 与功能标识                                                                   |
| `detectOgImageConvention(rootDir, srcDir)`                              | 探测 OG 图文件约定（`src/og-image.ts` / `src/opengraph-image.ts`）—— 它没有配置开关                  |
| `resolveConfigDependencies(config, options)`                            | 把选择展开成 `ResolvedProjectDependencies` 清单                                                      |
| `isProjectDependencyInstalled(name, cwd)`                               | 从项目根解析；`ERR_PACKAGE_PATH_NOT_EXPORTED` 计为已安装                                             |
| `resolveProjectUbeanVersion(cwd)`                                       | 读项目里的 `ubean` 版本，用于把 `@ubean/*` 扩展包钉到同版本                                          |
| `findMissingProjectDependencies(cwd, resolved)`                         | 筛出未安装项，保持清单顺序（required 在前）                                                          |
| `checkProjectDependencies` / `checkProjectDependenciesOnce`             | 完整检查：探测、报告，可选询问并安装                                                                 |
| `buildInstallPlan(missing, packageManager, ubeanVersion?)`              | `InstallPlan` —— `prod` / `dev` 包列表 + 可直接复制的 `commands`                                     |
| `formatMissingDependencyReport` / `formatSatisfiedReport`               | 人类可读报告输出器                                                                                   |
| `runInstallPlan(plan, cwd)`                                             | 执行一个 `InstallPlan`                                                                               |
| `resetProjectDependencyCheckCache` / `clearProjectDependencyProbeCache` | 缓存的测试钩子                                                                                       |

`ProjectDependencySpec` 记录 `name`、可选 `range`、人类可读的 `reason`、`requiredBy`、`kind: 'required' | 'optional'`、`installAs: 'dev' | 'prod'`，以及 `versionFromUbean`（把 `@ubean/<pkg>` 钉到项目的 ubean 版本）。两个消费方共享这份清单：`@ubean/cli` 的 `prepare` 命令，以及 `@ubean/build` Vite 插件的 `config` 钩子 —— 因此裸 `vite dev` 与 `ubean dev` 覆盖范围一致。

探测刻意使用 `createRequire(join(cwd, 'package.json')).resolve(name)` 而非本地包辅助库：在 pnpm 的 isolated `node_modules` 下，否则会沿 store 软链找到**框架自己**的副本，所有「你缺 X」提示都会失真。

## 包管理器工具

```ts
import { detectPackageManager, buildInstallCommand, formatCommand } from '@ubean/config';

const pm = detectPackageManager(process.cwd()); // 'pnpm' | 'yarn' | 'bun' | 'npm'
buildInstallCommand(pm, ['@vean/ui'], { dev: true });
formatCommand(buildInstallCommand(pm, ['@vean/ui']));
```

## 类型安全

- `defineConfig(config?: UbeanConfig): UbeanConfig` 是恒等函数，唯一职责是编辑器类型推断 —— `UbeanConfig` 为每个顶层字段提供类型（`rootDir`、`srcDir`、`mode`、`ssr`、`modules`、各内建开关、`routing`、`i18n`、`logging`、`build` 等）。
- `ResolvedConfig` 是 `Required<Omit<UbeanConfig, 'build' | 'dev' | 'preview' | 'prerender' | 'ssr' | …>>` —— 拥有独立解析器的配置域保留输入类型，统一经 `resolveSsrConfig` / `resolveRoutingConfig` 等读取。
- `ResolvedModule`、`ModuleDefinition`、`ModuleFactory`、`ModuleConfiguration` 为模块面提供类型；`ModuleHooks` 与 `ModuleKitContext` 同包导出。
- `ProjectDependencySpec`、`DependencyRequirement`、`ResolvedProjectDependencies`、`InstallPlan`、`ProjectDependencyCheckResult` 为依赖清单与检查提供类型。

## 架构说明

- **单入口。** 没有子路径导出；上述一切都能从 `@ubean/config` 取到。
- **缓存是模块级且刻意的。** `loadUbeanConfig` 写入模块作用域的 `cachedConfig`；`loadUbeanConfigSync` 优先复用它（CLI 对 `mode` / `ssr` 的修改因此得以保留），`getConfig` 在未加载时抛错，`tryGetConfig` 返回 `null`。
- **同步路径是为 Vite 存在的。** `loadUbeanConfigSync` 使用 `jiti`（`interopDefault: true`），因为 Vite 插件工厂会在 `vite.config.ts` 中被同步调用。配置文件里的顶层 `await` 会得到专门错误，而不是令人困惑的解析失败。
- **模块加载错误归因到真正的包。** `extractMissingPackageName` 区分「模块包没装」与「模块包装了、它的某个 peer 没装」。
- **依赖探测单例挂在 `globalThis` 上。** dev 的 SSR 图会内联 `ubean`、外部化 `@ubean/*` 子包，模块级 `Map` 会让两侧读到不同答案（见 AGENTS.md 陷阱 #19）。`clearProjectDependencyProbeCache` / `resetProjectDependencyCheckCache` 供测试使用。
- **Node-only。** 本包在构建期与 CLI 侧被消费；绝不应从客户端代码导入。
