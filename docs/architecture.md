# 架构与配置

## 4.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ubean 框架架构                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     CLI 层 (citty)                          │   │
│  │  ubean dev | ubean build | ubean prepare | ubean preview    │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                   核心层 (Core)                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │ Config   │  │ Routing  │  │  Build   │  │  Preset  │   │   │
│  │  │ Loader   │  │  Scan    │  │  System  │  │ Resolver │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │
│  │  │  Hooks   │  │ Dev      │  │ Prerender│  │  Types   │   │   │
│  │  │ System   │  │ Server   │  │  / SSG   │  │  System  │   │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                 Vite 插件层 (Vite-Plus)                      │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ ubeanPlugin()           │ ubeanVue()                 │  │   │
│  │  │ - Virtual modules       │ - Vue SFC 处理             │  │   │
│  │  │ - Client stubs          │ - SSR 渲染                 │  │   │
│  │  │ - Env schema            │ - 客户端路由               │  │   │
│  │  │ - Dev triggers          │ - Islands                  │  │   │
│  │  │ - Binding injection     │ - Head 管理                │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                  运行时层 (Runtime)                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │ Hono Server │  │  Router     │  │ Route Rules         │ │   │
│  │  │             │  │  (rou3)     │  │ (cache/headers/     │ │   │
│  │  │             │  │             │  │  redirects/ISR)     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │ Plugins     │  │ Storage     │  │ Database/Drizzle    │ │   │
│  │  │ (hookable)  │  │ (unstorage) │  │                     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │ WebSocket   │  │ SSE/Streams │  │ Cache/ISR           │ │   │
│  │  │ (crossws)   │  │             │  │                     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                 平台适配层 (Presets)                         │   │
│  │  Node.js │ Bun │ Deno │ Cloudflare │ Vercel │ Netlify │ ...│   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 4.2 核心数据流

#### 4.2.1 开发模式流程

```
ubean dev
  │
  ├─► 加载配置 (ubean.config.ts)
  │    └─► 解析 preset (自动检测或手动指定)
  │
  ├─► 扫描项目文件
  │    ├─► routes/        → API 路由
  │    ├─► pages/         → 页面路由 + .server.ts
  │    ├─► middleware/    → 全局中间件
  │    ├─► plugins/       → 运行时插件
  │    └─► public/        → 静态资源
  │
  ├─► 启动 Vite 开发服务器 (vite-plus)
  │    ├─► ubeanPlugin()
  │    │    ├─► 虚拟模块注册
  │    │    ├─► 客户端 stub 注入
  │    │    └─► 环境变量 schema 验证
  │    └─► ubeanVue()
  │         ├─► Vue SFC 处理
  │         └─► SSR/HMR 配置
  │
  ├─► 启动 Worker 运行时 (env-runner)
  │    └─► Hono 服务端处理请求
  │
  └─► 文件监听 → 热更新 → 自动刷新
```

#### 4.2.2 构建模式流程

```
ubean build
  │
  ├─► 加载配置 + 解析 preset
  ├─► 扫描项目文件
  ├─► 生成虚拟模块
  │    ├─► 路由清单
  │    ├─► 运行时配置
  │    ├─► 插件注册表
  │    └─► 平台 polyfills
  │
  ├─► 客户端构建 (Vite)
  │    └─► Vue SSR 客户端包
  │
  ├─► 服务端构建 (Rollup/Rolldown)
  │    ├─► 入口: preset 对应的 server entry
  │    ├─► 打包所有路由/中间件/插件
  │    ├─► 平台特定处理
  │    └─► 输出到 .output/server/
  │
  ├─► 静态资源处理
  │    └─► 输出到 .output/public/
  │
  ├─► 预渲染 (如启用 SSG)
  │    └─► 生成静态 HTML
  │
  └─► 生成平台配置文件
       └─► vercel.json / wrangler.toml / netlify.toml / ...
```

## 4.3 配置系统

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  // 平台预设: 自动检测或手动指定
  preset: 'node-server', // node-server | bun | deno | cloudflare | vercel | ...

  // 源代码目录
  srcDir: './',
  routesDir: './routes',
  pagesDir: './pages',
  middlewareDir: './middleware',
  publicDir: './public',

  // 服务端目录
  serverDir: './server',

  // 输出配置
  output: {
    dir: './.output',
    serverDir: './.output/server',
    publicDir: './.output/public'
  },

  // 路由规则
  routeRules: {
    '/**': { cache: { maxAge: 60 } },
    '/api/**': { cors: true },
    '/blog/**': { isr: 3600 },
    '/old-page': { redirect: '/new-page' }
  },

  // 运行时配置 (可通过 useRuntimeConfig() 访问)
  runtimeConfig: {
    apiSecret: '', // 仅服务端
    public: {
      apiBase: '/api' // 客户端可访问
    }
  },

  // 环境变量验证 Schema
  env: {
    DATABASE_URL: { type: 'string', required: true },
    API_KEY: { type: 'string', secret: true }
  },

  // 存储配置
  storage: {
    data: { driver: 'fs', base: './data' },
    redis: { driver: 'redis', url: '...' }
  },

  // 数据库配置
  database: {
    default: {
      connector: 'sqlite', // sqlite | postgresql | mysql | d1 | libsql
      options: {
        /* ... */
      }
    }
  },

  // 插件
  plugins: [],

  // 模块
  modules: [],

  // Vue 配置
  vue: {
    ssr: true,
    islands: false
  },

  // OpenAPI 文档配置
  openAPI: {
    meta: {
      title: 'My Ubean App',
      description: 'API documentation',
      version: '1.0.0'
    },
    route: '/_openapi.json', // OpenAPI JSON 端点
    production: 'runtime', // 'runtime' | 'prerender' | false
    ui: {
      scalar: { route: '/_scalar' }, // Scalar UI (默认开启, false 禁用)
      swagger: false // Swagger UI (默认关闭)
    }
  },

  // 构建配置
  build: {
    minify: true,
    sourcemap: false
  },

  // 开发服务器
  devServer: {
    port: 3000,
    host: 'localhost',
    watch: []
  },

  // 框架信息
  framework: {
    name: 'ubean',
    version: '0.1.0'
  }
});
```

## 4.4 应用约定式目录结构

用户项目使用 ubean 时的目录结构:

```
my-ubean-app/
├── routes/                    # API 路由 (文件式，单文件多方法命名导出)
│   ├── index.ts              # GET/POST /
│   ├── users.ts              # GET/POST/PUT/DELETE /users
│   ├── users/
│   │   └── [id].ts           # GET/PATCH/DELETE /users/:id
│   ├── auth/
│   │   └── login.ts          # POST /auth/login
│   └── api/
│       └── health.ts         # GET /api/health
│
├── pages/                     # 页面路由 (Vue SSR)
│   ├── index.vue             # /
│   ├── about.vue             # /about
│   ├── about.server.ts       # about 页面的 loader/action
│   ├── users/
│   │   ├── index.vue         # /users
│   │   ├── index.server.ts
│   │   ├── [id].vue          # /users/:id
│   │   ├── [id].reuse.ts     # reuse 路由配置: 复用已定义的路由 name
│   │   └── [id].server.ts
│   └── (auth)/               # 路由组 (不生成路径段)
│       ├── login.vue
│       └── register.vue
│
├── layouts/                   # 页面布局 (与 pages 同级)
│   ├── default.vue           # 默认布局 (或 default/index.vue)
│   ├── blank.vue             # 空白布局 (登录页等)
│   └── admin/
│       └── index.vue         # admin 布局
│
├── crons/                     # 定时任务 (cron 表达式)
│   └── daily-cleanup.ts      # 定时清理任务
│
├── queues/                    # 异步队列任务
│   └── email.ts              # 邮件队列
│
├── locales/                   # i18n 国际化消息文件
│   ├── en.ts
│   ├── zh-CN.ts
│   └── ja.ts
│
├── middleware/                # 中间件 (按数字前缀排序)
│   ├── 01.logger.ts
│   └── 02.auth.ts
│
├── plugins/                   # 运行时插件
│   ├── my-plugin.ts
│   └── auth.ts               # Better Auth 插件
│
├── db/                        # 数据库 (可选)
│   ├── schema.ts             # Drizzle schema
│   └── migrations/           # SQL 迁移文件
│
├── public/                    # 静态资源
│   └── favicon.ico
│
├── src/                       # 共享代码
│   ├── components/           # 自动导入 Vue 组件
│   ├── composables/          # 自动导入 Composables
│   └── utils/                # 工具函数
│
├── .ubean/                    # ubean 自动生成 (类型、路由数据等)
│   ├── routes.d.ts           # API routes OpenAPI 类型
│   ├── pages.d.ts            # pages 路由类型 + RouteName/LayoutName
│   ├── queues.d.ts           # 队列类型定义
│   ├── auto-imports.d.ts     # 自动导入类型声明
│   └── components.d.ts       # 组件自动导入类型声明
│
├── ubean.config.ts            # ubean 配置
├── app.ts                     # Vue App 配置 (defineApp)
├── env.ts                     # 环境变量定义
├── vite.config.ts
├── tsconfig.json
└── package.json
```
