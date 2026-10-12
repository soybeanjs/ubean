# @ubean/cli

**[English](./README.md) | 中文**

ubean 命令行：项目生命周期命令、脚手架、`.env` 与配置管理，以及用于程序化脚手架的零副作用库入口。

```bash
pnpm add -D ubean @ubean/cli
pnpm exec ubean dev
```

## 目录

- [包定位](#包定位)
- [安装](#安装)
- [快速开始](#快速开始)
- [库入口 vs 可执行入口](#库入口-vs-可执行入口)
- [命令](#命令)
  - [ubean init](#ubean-init)
  - [ubean dev](#ubean-dev)
  - [ubean build](#ubean-build)
  - [ubean preview](#ubean-preview)
  - [ubean prepare](#ubean-prepare)
  - [ubean analyze](#ubean-analyze)
  - [ubean env](#ubean-env)
  - [ubean config](#ubean-config)
  - [ubean devtools](#ubean-devtools)
- [脚手架](#脚手架)
  - [ubean page](#ubean-page)
  - [ubean api / layout / middleware / cron / plugin](#ubean-api--layout--middleware--cron--plugin)
  - [ubean scaffold](#ubean-scaffold)
- [库 API](#库-api)
- [脚手架契约](#脚手架契约)
- [体积预算工具](#体积预算工具)
- [全局参数](#全局参数)
- [类型安全](#类型安全)
- [架构说明](#架构说明)

## 包定位

`@ubean/cli` 拥有**工程化命令** —— 不属于生命周期编排的那些部分。dev / build / preview 三个生命周期本身位于
`@ubean/build` 的 Vite 插件（ADR-0012），CLI 命令是它们的薄别名。

| 负责                                                                                                              | 不负责                                                               |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 可执行命令：`dev` / `build` / `preview` / `prepare` / `init` / `page` / `env` / `config` / `devtools` / `analyze` | dev 请求路由、dev app 自举、构建编排、preview 接管 —— `@ubean/build` |
| 脚手架（`scaffold` / `deleteScaffold` / `recoverScaffold` / `listScaffoldableFiles`）+ 文件模板                   | 页面/布局扫描与路由元数据 —— `@ubean/scan` / `@ubean/vue`            |
| 机器可读的脚手架目录（`getScaffoldManifest`、`SCAFFOLD_CONTRACT_VERSION`）                                        | 配置形状与解析 —— `@ubean/config`                                    |
| 体积预算报告（`ubean analyze`）及其基线工具                                                                       | 产出 manifest 的构建 —— `@ubean/build`                               |
| `.env` 文件读写与 `ubean.config.ts` 的创建/展示                                                                   | 部署平台预设 —— `@ubean/preset`                                      |
| 基于 `env-runner` 的 dev worker 入口接线                                                                          | worker 入口源码本身 —— `@ubean/build/vite`                           |

**运行时依赖白名单（主入口 `@ubean/cli`）：** `citty`（命令解析）、`kolorist`（颜色）、`pathe`（路径），
外加 `@ubean/shared` 的 logger。主入口刻意**不** import Vite、不 import 插件、不 import 命令实现 ——
它是面向 scaffold / fs-ops / templates 的库入口，import 它**没有任何副作用**。

可选 peer 依赖：`@ubean/content`、`@ubean/devtools`、`@vitejs/plugin-vue`、`vite`。缺失时对应能力降级
（不引导 content collections、不挂载 DevTools）而不是报错 —— 但裸 Vite 命令仍需要 `vite` 本身，
而 `vite dev` 需要 `@vitejs/plugin-vue`，除非你的配置自带它。

`env-runner` **只**在这里，不得成为 `@ubean/build` 的依赖 —— 它会触发 pnpm 的 peer 变体分裂，
表现为 `Plugin` 类型身份不一致的类型错误。

## 安装

```bash
pnpm add -D ubean @ubean/cli
```

聚合包 `ubean` 依赖 `@ubean/cli` 并提供 `ubean` 可执行文件，它转发到 `@ubean/cli/cli`。
装聚合包就够了 —— 这里单独列出 `@ubean/cli`，只为需要该可执行文件或库入口而不需要框架的消费者。

`@ubean/cli` 包自身的 `bin` 条目临时命名为 **`ubean-next`**；用户可见的命令是 `ubean`。

## 快速开始

```bash
ubean init my-app --name my-app --template starter --preset node -y
cd my-app
pnpm install
pnpm dev
```

动手之前要知道的两条约定：

- 选项支持 `--flag value` 与 `--flag=value`；布尔可用 `--no-` 前缀取反（`--no-ssr`、`--no-install`、`--no-write`）。
- **选项名一律写全称。** 只有 `-f`、`-y`、`--pm` 有短形式。citty 会把 `init -n blog -t blog` 读成
  `{ n: true, t: true, _: ["blog", "blog"] }`，`template` / `preset` / `name` 全为 `undefined`
  （于是回退到 `unify` / `standard` / 目录名），并把 `-pm pnpm` 读成 `-p -m pnpm`，包管理器静默保持默认值。
  请写 `--name` / `--template` / `--preset` / `--pm`。

## 库入口 vs 可执行入口

本包有两个子路径，选错会带来可见后果。

| 子路径              | 是什么                                                        | 副作用                  |
| ------------------- | ------------------------------------------------------------- | ----------------------- |
| `@ubean/cli`（`.`） | 库入口：scaffold、fs-ops、templates、analyze 工具、脚手架目录 | **无** —— 可自由 import |
| `@ubean/cli/cli`    | 可执行入口；**import 它会在模块顶层执行 `runMain(main)`**     | 启动 CLI                |

`bin/ubean-next.mjs` 是两行转发 —— `import '../dist/cli.mjs';` —— 因为裸 import 可执行入口就足够了。

```ts
// ✓ 自己的工具代码从库入口 import
import { scaffold, getScaffoldManifest, createFsOps } from '@ubean/cli';

// ✗ 库代码里绝不要这么做 —— 它会启动 CLI
// import '@ubean/cli/cli';
```

## 命令

### ubean init

初始化一个新的 ubean 项目。

```bash
ubean init [dir]
```

| 参数    | 说明           | 默认值 |
| ------- | -------------- | ------ |
| `[dir]` | 要初始化的目录 | `.`    |

| 选项               | 别名   | 说明                                   | 默认值     |
| ------------------ | ------ | -------------------------------------- | ---------- |
| `--force`          | `-f`   | 覆盖已存在的文件                       | `false`    |
| `--name`           | —      | 项目名                                 | —          |
| `--template`       | —      | 项目模板（unify/minimal/starter/blog） | `unify`    |
| `--preset`         | —      | 目标预设（standard/node/cloudflare/…） | `standard` |
| `--packageManager` | `--pm` | 包管理器（npm/pnpm/yarn/bun）          | `npm`      |
| `--git`            | —      | 初始化 git 仓库（用 `--no-git` 跳过）  | —          |
| `--yes`            | `-y`   | 跳过交互，使用默认值                   | `false`    |

模板：`unify`（含 islands/i18n/layouts/middleware 的全栈模板 —— 默认）、`minimal`（hello world 页面）、
`starter`（含 pages/api/layouts）、`blog`（基于 markdown 的博客结构）。

交互式预设菜单只提供三个选项 —— `standard`（默认）、`node`、`cloudflare`。其他平台预设必须显式传入：
`cloudflare-dev`、`vercel`、`vercel-edge`、`netlify`、`bun`、`deno`、`aws`、`azure`（共 11 个预设）。

行为说明：没有 `--yes` 且在 TTY 中时，命令会交互询问项目名、模板、预设、包管理器与 git 初始化。
非法的 `--packageManager` 值回退到 `npm`。已存在文件只在传了 `--force` 时才被覆盖；非交互模式下非空目录
会直接报错退出，除非传了 `--force`。非交互模式由 `--yes`、非 TTY stdin，或 `CI` / `NONINTERACTIVE`
环境变量强制开启。

```bash
# 非交互模式,显式指定各项
ubean init my-app --name my-app --template starter --preset node -y

# 使用交互菜单之外的预设
ubean init my-app --preset vercel-edge -y

# 跳过 git 初始化
ubean init my-app --no-git
```

### ubean dev

启动带热重载的开发服务器。

```bash
ubean dev
```

| 选项            | 说明                                                     | 默认值      |
| --------------- | -------------------------------------------------------- | ----------- |
| `--port`        | 监听端口                                                 | `9527`      |
| `--host`        | 监听主机                                                 | `localhost` |
| `--strictPort`  | 端口被占用时直接退出，而不是自动递增                     | `false`     |
| `--verbose`     | 输出详细启动日志（扫描、codegen、诊断、重载）            | —           |
| `--logRequests` | 记录每个请求（`GET /path 200 12ms`）；ssg/spa 模式下忽略 | —           |
| `--open`        | 启动时打开浏览器                                         | `false`     |
| `--cwd`         | 项目根目录                                               | `.`         |

没有 `--https` 选项，也没有 `-p` 短别名。`--port` / `--host` 覆盖 `ubean.config.ts` 的 `dev.port` / `dev.host`。

行为：扫描项目、把类型声明生成到 `.ubean/`、启动 dev server。监听 `srcDir` 下的 `api`、`pages`、`middleware`、
`layouts`、`plugins`、`app`、`routes`；变更会触发重扫与重载。fullstack/backend 模式下 banner 会列出
Scalar UI（`/_scalar`）与 OpenAPI schema（`/_openapi.json`）的 URL，OpenAPI 类型异步生成到 `.ubean/`。

`ssg` 模式下 dev 默认关闭安全响应头（CSP/HSTS/…）—— 静态产物不含框架注入的安全头（由托管平台控制），
dev 因此对齐这一事实。在 `ubean.config.ts` 中显式设置 `security.headers` 可重新开启它们，作为 CSP 调试入口。
DevTools 模块启用时，其 URL 会出现在 banner 中。

```bash
ubean dev --port 3000 --host 0.0.0.0
ubean dev --strictPort
```

### ubean build

构建生产版本。

```bash
ubean build
```

| 选项          | 说明                                                                       | 默认值  |
| ------------- | -------------------------------------------------------------------------- | ------- |
| `--preset`    | 部署预设（node、bun、deno、cloudflare、vercel、netlify、standard……）       | —       |
| `--mode`      | 应用模式（fullstack、spa、ssg、backend）；覆盖 `ubean.config.ts`           | —       |
| `--ssr`       | 在 fullstack 模式下启用 SSR（`--no-ssr` 关闭）；仅 `--mode fullstack` 生效 | —       |
| `--ssg`       | `--mode ssg` 的简写                                                        | `false` |
| `--outDir`    | 输出目录（覆盖 `ubean.config.ts` 的 `build.outputDir`）                    | —       |
| `--minify`    | 压缩产物（`--no-minify` 关闭）                                             | `true`  |
| `--sourcemap` | 生成 sourcemap                                                             | `false` |
| `--prerender` | 预渲染静态页面（`--no-prerender` 关闭）                                    | —       |
| `--cwd`       | 项目根目录                                                                 | `.`     |

没有 `--clean` 选项。`--preset` 没有 CLI 默认值 —— 它回退到 `ubean.config.ts` 的 `build.preset`，后者默认 `node`。

`--mode ssg`（或 `--ssg`）通过**直接渲染路径**启用完整预渲染：一个最小静态产物逐个渲染路由，不经过 Hono 管道。
`pages/404.vue` 渲染为 `404.html` 供静态托管使用；i18n 路由按 strategy 展开（如 `/about` + `/zh/about`）。
之后会删除临时的 `dist/server` 产物 —— 设置 `UBEAN_KEEP_SSR` 可保留它。该模式下页面 `loader` 不执行
（一次性警告）；需要 loader 时请用 fullstack 预渲染。

`spa` 与 `backend` 模式关闭预渲染；fullstack 配合 `ssr: false` 同样关闭。`--prerender` / `--no-prerender`
覆盖解析结果。preset 的 `build:before` / `build:after` 钩子会被执行。

```bash
ubean build --preset cloudflare
ubean build --ssg
ubean build --no-ssr --sourcemap
```

`ubean build` ≡ `vite build`，只有一处差别：`vite build` **忽略 `--outDir`**，始终写入 `config.build.outputDir`。

### ubean preview

本地预览生产构建。请先运行 `ubean build`。

```bash
ubean preview
```

| 选项           | 说明                                       | 默认值      |
| -------------- | ------------------------------------------ | ----------- |
| `--port`       | 监听端口                                   | `9725`      |
| `--host`       | 监听主机                                   | `localhost` |
| `--strictPort` | 端口被占用时直接退出，而不是自动递增       | `false`     |
| `--outDir`     | 要预览的输出目录（覆盖 `build.outputDir`） | —           |
| `--cwd`        | 项目根目录                                 | `.`         |

没有 `-p` 短别名。`--port` / `--host` 覆盖 `preview.port` / `preview.host`（默认 `9725` / `localhost`）。

`spa` / `ssg` 模式用内置静态文件服务器服务 `dist/public/`（SPA 回退到 `index.html`；SSG 解析
`<path>/index.html` 或 `<path>.html`）。`fullstack` / `backend` 模式以 `PORT` 与 `HOST` 环境变量启动构建出的
`dist/server/server.mjs`。`cloudflare` 预设不支持本地预览 —— 请改用 `wrangler dev`；该平台预览只在
`ubean preview` 一侧接线（经 miniflare）。其他 fetch handler 预设会带警告地运行 `handler.mjs`。
端口被占用时，除非设置 `--strictPort`，否则使用下一个空闲端口。

### ubean prepare

生成类型声明并检查项目依赖。

```bash
ubean prepare
```

| 选项        | 说明                                            | 默认值 |
| ----------- | ----------------------------------------------- | ------ |
| `--cwd`     | 项目根目录                                      | `.`    |
| `--install` | 提示安装缺失的项目依赖（`--no-install` 只告警） | `true` |

命令会扫描项目并把类型声明生成到 `.ubean/`。依赖检查把已解析配置与项目必须声明的依赖对照：

- **必需** —— 核心包（`vue`、`vue-router`、`vue-i18n`）、每个已启用内置模块背后的包
  （`ui: true` → `@ubean/integrations` + `@vean/ui`），以及这些模块的必需 peer；
- **可选** —— 按功能开关的包（MDX 用 `@mdx-js/mdx`，存在 OG image 约定文件时用 `satori` +
  `@resvg/resvg-js`，content 搜索用 `pagefind`，`cloudflare-dev` 用 `miniflare`，邮件用 `nodemailer`）。

每条缺失项都会指出谁需要它、为什么需要（`required by \`ui\``），并跟一条可复制的安装命令。
构建期 peer 归 `devDependencies`，运行期 peer 归 `dependencies`。在交互终端上会在安装前询问，
使用项目的包管理器（按 lockfile 探测：pnpm > yarn > bun > npm），`@ubean/*`包固定为`@^<ubean-version>`。

同一份检查也会从 Vite 插件的 `config` 钩子运行，因此裸 `vite dev` / `vite build`（从不调用 `prepare`）
同样被覆盖。设置 `UBEAN_SKIP_DEP_CHECK=1` 可关闭。没有 `--force` 参数；缺失依赖与安装失败都是非致命警告。
`--no-install` 只跳过自动安装 —— 警告仍会打印，这在 CI 里正是想要的行为。

### ubean analyze

从 Vite 客户端 manifest 报告客户端 JS 预算。请在 `ubean build` 之后运行。

```bash
ubean analyze
```

| 选项            | 说明                                                              | 默认值                        |
| --------------- | ----------------------------------------------------------------- | ----------------------------- |
| `--cwd`         | 项目根                                                            | `process.cwd()`               |
| `--write`       | 写入 `.ubean/bundle-baseline.json`（`--no-write` 关闭）           | `true`                        |
| `--out`         | 基线 JSON 输出路径                                                | `.ubean/bundle-baseline.json` |
| `--check`       | 与之对比的已提交基线 JSON（gzip 增长超过 `--maxIncrease` 时失败） | —                             |
| `--maxIncrease` | 使用 `--check` 时允许的相对 gzip 增长                             | `0.05`                        |

需要客户端 Vite manifest；找不到构建产物时直接报错（退出码 1）。它会报告总 gzip 与入口 gzip 体积，
以及最大的 JS chunk。`--check` 与已提交基线对比，总 gzip 或入口 gzip 超过允许的相对增长时失败。

```bash
ubean build && ubean analyze
ubean analyze --no-write
ubean analyze --check benchmarks/bundle-baseline.json --no-write
```

### ubean env

管理 `.env` 文件。

```bash
ubean env <add|remove|list|init>
```

| 子命令       | 参数            | 选项                                                       |
| ------------ | --------------- | ---------------------------------------------------------- |
| `env add`    | `<key> <value>` | `--file`（默认 `.env`）、`--public`、`-f/--force`、`--dry` |
| `env remove` | `<key>`         | `--file`、`--dry`                                          |
| `env list`   | —               | `--file`、`--public`（只显示公开变量）                     |
| `env init`   | —               | `-f/--force`、`--dry`                                      |

`--public` 会给键加上 `UBEAN_PUBLIC_` 前缀，除非它已经以 `UBEAN_PUBLIC_` / `VITE_` / `PUBLIC_` 开头。
`env list` 把带这些前缀的键标记为 `[public]`。`env init` 由模板创建 `.env` 与 `.env.example`。

```bash
ubean env init
ubean env add DATABASE_URL postgres://localhost/app
ubean env add API_URL https://api.example.com --public
ubean env list --public
```

### ubean config

管理 `ubean.config.ts`。

```bash
ubean config <init|show|example|path>
```

| 子命令           | 选项                                                                                                      | 说明                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `config init`    | `--preset`（默认 `standard`；任何已注册预设名 —— `vercel-edge`、`aws`、`azure`……）、`-f/--force`、`--dry` | 创建默认 `ubean.config.ts`                       |
| `config show`    | —                                                                                                         | 显示当前配置文件位置与内容                       |
| `config example` | —                                                                                                         | 显示包含全部选项的完整示例配置                   |
| `config path`    | —                                                                                                         | 打印解析后的配置文件路径（无配置文件时退出码 1） |

没有 `--json` 或 `--env` 参数。

```bash
ubean config init --preset node
ubean config init --dry
ubean config path
```

### ubean devtools

管理 DevTools 配置与信息。该命令既不打开浏览器也不启动服务器 —— DevTools 本身运行在 dev server 内。

```bash
ubean devtools <info|path>
```

| 子命令          | 选项                    | 说明                                                   |
| --------------- | ----------------------- | ------------------------------------------------------ |
| `devtools info` | —                       | 显示 DevTools 信息（访问方式、配置、功能）             |
| `devtools path` | `--port`（默认 `9527`） | 打印 DevTools URL：`http://localhost:<port>/_devtools` |

```bash
ubean devtools path
ubean devtools path --port 3000
```

在浏览器中，dev server 运行期间访问 banner 里给出的 URL（默认 `/_devtools`）即可打开 DevTools；
它重定向到 devframe hub 外壳，后者以 iframe devframe 的形式承载面板。

## 脚手架

脚手架命令创建、删除、恢复与列出文件。共用约定：

| 类型         | 基准目录          | 扩展名               |
| ------------ | ----------------- | -------------------- |
| page / reuse | `src/pages/`      | `.vue` / `.reuse.ts` |
| api          | `src/routes/`     | `.ts`                |
| layout       | `src/layouts/`    | `.vue`               |
| middleware   | `src/middleware/` | `.ts`                |
| cron         | `src/crons/`      | `.ts`                |
| plugin       | `src/plugins/`    | `.ts`                |

cron 文件落在 `src/crons/`，与扫描器默认值一致（`DEFAULT_DIRS.crons = 'crons'`）。
文件名数字前缀控制注册顺序（`01.cleanup.ts`）。

共用语义：

- `add` 跳过已存在文件，除非传 `-f/--force`（覆盖前会创建 `.bak` 备份）。
- `delete` 默认创建 `.bak` 备份；`-f/--force` 直接永久删除、不留备份。
- `recovery` 恢复最近的 `.bak` 备份；`--dry` 只检查能否恢复。
- `--dry` 只打印动作，不写文件。
- 组件名由路由路径派生：动态段转 PascalCase（`[id]` → `Id`），`[...slug]` → `AllSlug`，
  `[[page]]` → `PageOptional`。

### ubean page

所有类型的通用脚手架入口。

```bash
ubean page <add|add-reuse|delete|recovery|list>
```

| 子命令                  | 参数                                                    | 选项                                                                                                                                               |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page add <path>`       | 路由路径（如 `users/[id]`、`api/users`、`crons/daily`） | `--type`（page/api/layout/middleware/cron/plugin，默认 `page`）、`--method`（默认 `GET`）、`--schedule`（默认 `* * * * *`）、`-f/--force`、`--dry` |
| `page add-reuse <path>` | 路由路径                                                | `-f/--force`、`--dry`                                                                                                                              |
| `page delete <path>`    | 路由路径                                                | `--type`（… + `reuse`）、`-f/--force`、`--dry`                                                                                                     |
| `page recovery <path>`  | 路由路径                                                | `--type`、`--dry`                                                                                                                                  |
| `page list`             | —                                                       | `--type`                                                                                                                                           |

`add` 的 `--type` **不**包含 `reuse` —— 请改用 `page add-reuse`。

```bash
ubean page add about
ubean page add "users/[id]"
ubean page add api/users --type api --method POST
ubean page add daily-cleanup --type cron --schedule "0 0 * * *"
ubean page add dashboard --dry
```

### ubean api / layout / middleware / cron / plugin

各类型专用命令，均带 `add`、`delete`、`recovery`、`list` 四个子命令。

| 命令                   | 参数     | 额外选项                         | 共用选项              |
| ---------------------- | -------- | -------------------------------- | --------------------- |
| `ubean api add`        | `<path>` | `--method`（默认 `GET`）         | `-f/--force`、`--dry` |
| `ubean cron add`       | `<path>` | `--schedule`（默认 `* * * * *`） | `-f/--force`、`--dry` |
| `ubean layout add`     | `<path>` | —                                | `-f/--force`、`--dry` |
| `ubean middleware add` | `<path>` | —                                | `-f/--force`、`--dry` |
| `ubean plugin add`     | `<path>` | —                                | `-f/--force`、`--dry` |

`delete <path>` 接受 `-f/--force`（永久删除、不留备份）与 `--dry`；`recovery <path>` 接受 `--dry`；
`list` 无选项。

```bash
ubean api add users/[id] --method DELETE
ubean layout add admin
ubean middleware add auth
ubean cron add daily-cleanup --schedule "0 0 * * *"
ubean plugin add my-plugin
ubean api list
ubean api delete users/[id]
ubean api recovery users/[id]
```

### ubean scaffold

供 studio 与 IDE 集成使用的机器可读脚手架目录。

```bash
ubean scaffold describe
```

`describe` 把脚手架 JSON 清单打印到 stdout。它包含 `contractVersion` 与 `types` 数组，
每个条目带 `type`、`cli`、`baseDir`、`extensions`、`args`。

```bash
ubean scaffold describe
ubean scaffold describe | jq '.types[].type'
```

## 库 API

从 `@ubean/cli` import —— 无副作用，不启动 CLI。

```ts
import {
  scaffold,
  deleteScaffold,
  recoverScaffold,
  listScaffoldableFiles,
  getScaffoldManifest,
  SCAFFOLD_CONTRACT_VERSION,
  createFsOps
} from '@ubean/cli';

const result = await scaffold({
  cwd: process.cwd(),
  type: 'api', // 'page' | 'api' | 'layout' | 'middleware' | 'reuse' | 'cron' | 'plugin'
  path: 'users/[id]',
  method: 'POST',
  force: false,
  dry: false // baseDir?: string 可覆盖该类型的默认目录
});
// → { created, deleted, restored, skipped, errors }
```

| 导出                                           | 说明                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `scaffold(options)` / `ScaffoldOptions`        | 创建文件；`ScaffoldResult` = `{ created, deleted, restored, skipped, errors }` |
| `deleteScaffold(options)`                      | 删除并留 `.bak` 备份，除非 `force`                                             |
| `recoverScaffold(options)`                     | 从最近的 `.bak` 恢复                                                           |
| `listScaffoldableFiles(cwd, type, baseDir?)`   | 列出某类型的已存在文件                                                         |
| `ScaffoldType`                                 | `'page' \| 'api' \| 'layout' \| 'middleware' \| 'reuse' \| 'cron' \| 'plugin'` |
| `createFsOps(cwd)` / `FsOps`                   | 绑定到项目根的文件系统工具（见下）                                             |
| `toKebabCase` / `toPascalCase` / `toCamelCase` | 模板使用的命名转换                                                             |

模板渲染，供自行生成文件的工具导出：

```ts
import { renderTemplate, renderApiTemplate, API_TEMPLATE } from '@ubean/cli';

renderTemplate('Hello {{name}}', { variables: { name: 'ubean' } });
```

`renderPageTemplate`、`renderApiTemplate`、`renderMiddlewareTemplate`、`renderLayoutTemplate`、
`renderCronTemplate`、`renderPluginTemplate` 各自接收自己的数据接口（`PageTemplateData`、
`ApiTemplateData`、`MiddlewareTemplateData`、`LayoutTemplateData`、`CronTemplateData`、
`PluginTemplateData`）；原始模板字符串 `PAGE_TEMPLATE` / `API_TEMPLATE` / `MIDDLEWARE_TEMPLATE` /
`LAYOUT_TEMPLATE` / `CRON_TEMPLATE` / `PLUGIN_TEMPLATE` 也一并导出，另有 `TemplateVariables`
与 `TemplateOptions`。

`FsOps`（来自 `createFsOps(cwd)`）打包了 `resolvePath`、`ensureDir`、`exists`、`readFile`、`writeFile`、
`appendFile`、`remove`、`copyFile`、`copyDir`、`readDir`、`readJson`、`writeJson`、`createBackup`、
`restoreBackup`、`removeBackup`、`listFiles`。`FsOpOptions`（重新导出为 `FsOpsOptions`）与
`BackupOptions` 用于配置。

## 脚手架契约

`getScaffoldManifest()` 返回 `ubean scaffold describe` 打印的那份目录 —— 也是 studio 与 IDE 插件的集成点。

```ts
import { getScaffoldManifest, SCAFFOLD_CONTRACT_VERSION } from '@ubean/cli';

const manifest = getScaffoldManifest();
// {
//   contractVersion: 1,
//   types: [{ type, cli, baseDir, extensions, args: [{ name, required, description, default? }] }]
// }
```

`SCAFFOLD_CONTRACT_VERSION` 为 `1`，且类型是字面量，因此清单自身的 `contractVersion` 字段受它约束。
每个 `ScaffoldTypeManifest` 记录是否存在专用 CLI 命令（api/layout/middleware/cron/plugin 为
`cli: true`；**`reuse` 为 `false`**，仅库 API 可用。reuse 路由通过 `scaffold({ type: 'reuse' })`
或 `ubean page add-reuse` 创建）。

## 体积预算工具

`ubean analyze` 的实现可导出，因此 CI 脚本无需 spawn CLI 就能报告或设闸。

```ts
import {
  findClientManifest,
  readViteManifest,
  summarizeBundle,
  compareBundleBaseline,
  writeBundleBaseline
} from '@ubean/cli';

const manifest = findClientManifest(process.cwd());
const baseline = summarizeBundle(outDir, readViteManifest(manifest.path));
const violations = compareBundleBaseline(baseline, committedBaseline, { maxIncrease: 0.05 });
```

| 导出                                                  | 说明                                         |
| ----------------------------------------------------- | -------------------------------------------- |
| `findClientManifest(cwd)`                             | 定位客户端 Vite manifest                     |
| `readViteManifest(manifestPath)`                      | 解析它 → `Record<string, ManifestChunk>`     |
| `summarizeBundle(outDir, manifest)`                   | → `BundleBaseline`（总 gzip + 入口 gzip）    |
| `compareBundleBaseline(current, committed, options?)` | → 预算违规项；`options` 携带允许的相对增长比 |
| `writeBundleBaseline(filePath, baseline)`             | 落盘基线                                     |

`BundleBaseline`、`BundleBudgetEntry` 与 `ManifestChunk` 从主入口导出。报告的数字都是 gzip 体积；
相对增长上限与绝对上限 `--max-total-kb` / `--max-entry-kb` / `--max-chunk-kb` 是彼此独立的闸门。

## 全局参数

```bash
ubean --help
ubean <command> --help
ubean --version
```

`--debug` 开启详细日志（时间戳、调用位置、日志级别），放在子命令前或后都生效：

```bash
ubean --debug dev
ubean dev --debug
```

CLI **不**读取 `UBEAN_PORT` / `UBEAN_HOST` —— 请用 `--port` / `--host` 或 `ubean.config.ts` 的
`dev` / `preview` 字段。

| 变量                        | 使用方            | 说明                                                       | 默认值    |
| --------------------------- | ----------------- | ---------------------------------------------------------- | --------- |
| `PORT`                      | 生产服务器        | 生成的生产服务入口里的服务端端口                           | `9527`    |
| `HOST`                      | 生产服务器        | 生成的生产服务入口里的服务端主机                           | `0.0.0.0` |
| `CI` / `NONINTERACTIVE`     | init              | 强制非交互模式                                             | —         |
| `UBEAN_KEEP_SSR`            | build（SSG 模式） | 保留临时的 `dist/server` 产物而不删除                      | —         |
| `UBEAN_SKIP_DEP_CHECK`      | 依赖检查          | 跳过项目依赖检查                                           | —         |
| `LOG_LEVEL` / `TSLOG_LEVEL` | logging           | logger 最低级别（silly/trace/debug/info/warn/error/fatal） | `info`    |
| `TSLOG_TYPE`                | logging           | logger 输出格式（json/pretty/hidden）                      | —         |

退出码：`0` 成功，`1` 一般错误。`config path` 在不存在配置文件时也返回 `1`。

## 类型安全

- `ScaffoldType` 是字符串字面量联合，因此 `scaffold({ type })` 与 `--type` 的取值在编译期就被约束，
  而不是等到写文件时才出错。
- `FsOps` 是 `ReturnType<typeof createFsOps>`，即各工具的形态由工厂派生而非手工声明 —— 不会漂移。
- 模板渲染器按模板分别定型（`PageTemplateData`、`ApiTemplateData` …），因此漏一个变量是类型错误，
  而不是产物里留下 `{{placeholder}}`。
- `ScaffoldManifest` / `ScaffoldTypeManifest` / `ScaffoldArgManifest` 描述 CLI 输出的 JSON；
  `SCAFFOLD_CONTRACT_VERSION` 是字面量类型（`1`）而不是 `number`，因此清单里的 `contractVersion` 被钉住。
- 库导出全部声明在 `dist/index.d.ts` 中；可执行入口刻意只带一个空的声明文件（`cli.d.ts`），
  因为它没有 API 面。

## 架构说明

- **CLI 不拥有 dev/build/preview 生命周期。** ADR-0012 把它们下放到 Vite 插件：`ubeanPlugin()` 在
  `config` 钩子里注册 `client` 与 `ubean` 两个环境以及 `builder.buildApp`，因此
  `vite dev | build | preview` 就是完整工具链，CLI 命令只是薄别名。两条路径的产物逐项一致
  （`packages/cli/test/build-contracts.test.ts`）。
- **两个入口，副作用契约不同。** 主入口是库；`./cli` 在模块顶层执行 `runMain(main)`，只能被可执行文件 import。
  这正是 `bin/ubean-next.mjs` 只写一句 `import '../dist/cli.mjs';` 的原因。
- **没有用户 `vite.config.ts` 的项目依然受支持。** 这种情况下由 CLI 注入 builtin 插件；插件不会重复注册。
  设置了 `UBEAN_BUILD_DRIVEN_BY_CLI` 时，插件不得再注册自己的 `buildApp`，否则同一次构建会被编排两次。
- **代码生成的所有权通过环境变量协商。** `ubean dev` / `build` / `prepare` 设置
  `UBEAN_CODEGEN_BY_CLI=1`（构建路径还设置 `UBEAN_BUILD_DRIVEN_BY_CLI=1`），使 Vite 插件让位 ——
  没有它，裸 `vite build` 完全不产出 `.ubean/*.d.ts`，用户的类型检查就会失败。
- **`env-runner` 必须留在这个包里。** 它不是 `@ubean/build` 的依赖；加过去会触发 pnpm 的 peer 变体分裂，
  表现为 `Plugin` 类型身份不一致的类型错误。
- **`ubean-next` 这个可执行名是临时的。** 用户可见的命令是 `ubean`；本包自身 `bin` 条目的更名尚未落地。
- **cron 脚手架目标是 `src/crons/`**，与扫描器的 `DEFAULT_DIRS.crons` 对齐，而不是 `src/tasks/`
  或其他看似合理的名字。
- **生命周期迁移刻意没有配置层回滚项。** `experimental.viteBuilder` 已随两次 `viteBuild` 的旧编排删除；
  回滚只能回退版本。
- **本包的测试套件串行运行。** 多个套件构建到同一个共享示例目录（`examples/ubean-test` 的 `dist/` 与
  `.ubean/`）—— 并发构建并预览同一个输出目录会失败 —— 因此本包的 Vitest 配置关闭了文件级并行。
  修法是按套件隔离目录，而不是改写示例源码。
