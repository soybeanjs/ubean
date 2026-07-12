# 工程规范、测试与发布

## 5.1 核心原则

1. **纯函数优先**: 所有工具函数必须是纯函数，相同输入产生相同输出，无副作用
2. **不可变性**: 使用 `const`、`readonly`、`Object.freeze()`、展开运算符而非突变
3. **函数组合**: 使用 pipe/compose 模式组合函数，避免深层嵌套
4. **高阶函数**: 使用高阶函数抽象通用模式
5. **类型安全**: 严格 TypeScript，避免 `any`，充分利用泛型
6. **无类设计**: 优先使用工厂函数和闭包而非 class；必要时仅在运行时核心使用 class (如 Router、DevServer)
7. **核心纯函数**: 路由解析、配置归并、代码生成与类型计算保持纯函数；Hono app、Hookable、文件系统、网络和可变上下文位于明确的 adapter/effect 边界，并通过参数注入依赖

## 5.2 文件组织规范

```typescript
// 1. 类型导入放最前
import type { Config, ResolvedConfig } from '../types';
import type { Preset } from '../preset/types';

// 2. 外部依赖
import { resolve, join } from 'pathe';
import { defu } from 'defu';
import { consola } from 'consola';

// 3. 内部依赖
import { readConfig } from './loader';
import { resolvePaths } from './resolvers/paths';

// 4. 常量定义 (纯数据)
const DEFAULT_CONFIG = {
  srcDir: './',
  output: {
    dir: './.output'
  }
} as const;

// 5. 纯工具函数 (不依赖外部状态)
// - 命名: 动词开头，小写驼峰
// - 必须有 JSDoc 注释说明用途、参数、返回值
// - 必须有类型标注
/**
 * 合并用户配置与默认配置
 * @param userConfig - 用户配置
 * @param defaults - 默认配置
 * @returns 合并后的配置
 */
function mergeConfig<T extends Record<string, unknown>>(userConfig: Partial<T>, defaults: T): T {
  return defu(userConfig, defaults) as T;
}

// 6. 主要导出函数
// - 命名: 具名导出优先
// - 复杂函数内部拆分为小的纯函数
/**
 * 加载并解析 ubean 配置
 * @param rootDir - 项目根目录
 * @param opts - 加载选项
 * @returns 解析后的配置
 */
export async function loadOptions(rootDir: string, opts: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const rawConfig = await readConfig(rootDir, opts);
  const preset = await resolvePreset(rawConfig.preset, { dev: opts.dev });
  const withDefaults = mergeConfig(rawConfig, DEFAULT_CONFIG);

  return resolvePaths(withDefaults, rootDir);
}

// 7. 避免: 默认导出、class、let 突变、any 类型
```

## 5.3 异步函数规范

```typescript
// ✅ 好的做法: 返回 Promise，使用 async/await
async function readJsonFile<T>(path: string): Promise<T> {
  const content = await fsp.readFile(path, 'utf-8');
  return JSON.parse(content) as T;
}

// ✅ 好的做法: 错误处理返回 Result 类型或抛出特定错误
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function tryReadJson<T>(path: string): Promise<Result<T>> {
  try {
    const value = await readJsonFile<T>(path);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}
```

## 5.4 类型设计规范

```typescript
// ✅ 使用 interface 定义对象形状，type 定义联合类型/工具类型
export interface UbeanOptions {
  readonly rootDir: string;
  readonly preset: PresetName;
  readonly dev: boolean;
}

// ✅ 使用字面量类型 + as const
export const PRESET_NAMES = ['node-server', 'bun', 'deno', 'cloudflare', 'vercel'] as const;

export type PresetName = (typeof PRESET_NAMES)[number];

// ✅ 使用泛型保持类型安全
function createHandler<T extends EventHandler>(handler: T): T {
  return handler;
}

// ✅ 条件类型做类型推断
type InferLoaderData<T> = T extends () => Promise<{ data: infer D }> ? D : never;
```

---

## 6. 测试策略

### 6.1 测试框架

- **vitest** (vite-plus 集成版本)
- **@vitest/coverage-v8** (覆盖率)

### 6.2 测试类型

1. **单元测试** (`test/unit/`)
   - 纯函数测试: 工具函数、配置解析、路由匹配
   - 不依赖文件系统或网络
   - 快速执行，覆盖率目标 > 90%
2. **集成测试** (`test/integration/`)
   - 构建流程测试
   - 开发服务器测试
   - Preset 适配测试
   - 使用 test/fixtures 中的完整项目
3. **浏览器端到端测试** (`test/e2e/`)

- 使用 Playwright 验证 SSR hydration、客户端导航、表单 action 与错误页
- 只对正式支持的 preset 执行，不以模拟器替代正式平台 smoke test

1. **类型测试**
   - 使用 `expectTypeOf` 验证类型推导
2. **打包与部署 smoke test**

- `pnpm pack` 后在独立 fixture 安装并验证公开 exports、CLI 与类型声明
- 对每个正式 preset 执行 `dev`、`build`、`preview` 和目标平台部署 smoke test

### 6.3 持续验收门槛

测试不是最后阶段的收尾任务。每个实现阶段都必须新增或更新对应 fixture，并在合并前满足以下门槛：

1. 单元测试覆盖新增的纯计算、扫描和代码生成逻辑。
2. 至少一个真实 fixture 覆盖新增能力的 `dev`、`build` 和 `preview` 路径。
3. 公开 TypeScript API 添加正反类型测试；生成文件变更需验证增量更新与冷启动结果一致。
4. 改动 SSR、路由或页面协议时添加浏览器端到端测试。
5. 改动 preset 能力时更新能力矩阵，并运行该 preset 的本地或远程 smoke test。
6. 改动客户端传输时，覆盖 ofetch 默认路径、XHR `FormData` 上传进度、取消、超时、未知 total、HTTP/网络错误归一化，以及 SSR/edge 的不支持诊断。

覆盖率用于发现盲区，不作为替代契约测试的发布标准。核心运行时与公开 API 默认纳入统计；仅生成代码、平台不可执行的 shim 和经批准的适配器分支可排除，并在配置旁说明原因。

### 6.4 当前验证基线（2026-07-12）

- `pnpm test`（主包）：35 个测试文件、822 个测试通过。
- 扩展包测试：`@ubean/icon` 32个、`@ubean/auth` 13个、`@ubean-pwa` 19个，均通过。
- `pnpm typecheck`：通过。TypeScript 7 与 `vue-tsc` 的兼容层通过 workspace override `typescript: npm:typescript-native-bridge@0.0.0` 提供；其原生依赖 `koffi` 必须在 `pnpm-workspace.yaml` 的 `allowBuilds` 中显式允许。
- `pnpm build`：通过（主包 + 所有扩展包：ubean-icon、ubean-pwa、ubean-auth、ubean-image、ubean-content、ubean-fonts）。
- 路线图中标为 ✅ 的任务必须有对应源码、公开调用路径和与风险相称的验证；命令骨架、正则提取或未接通的运行时路径不得作为完整交付标记。

### 6.5 测试配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'pathe';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/fixtures/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/__generated__/**']
    },
    testTimeout: 30000,
    hookTimeout: 30000
  },
  resolve: {
    alias: {
      ubean: resolve(__dirname, 'src/index.ts'),
      'ubean/meta': resolve(__dirname, 'src/meta.ts')
    }
  }
});
```

### 6.6 测试示例

```typescript
// test/unit/routing.test.ts
import { describe, it, expect } from 'vitest';
import { parseRoutePattern, matchRoute } from '../../src/utils/route';

describe('route utils', () => {
  describe('parseRoutePattern', () => {
    it('should parse static routes', () => {
      const result = parseRoutePattern('/users');
      expect(result).toEqual({
        pattern: '/users',
        params: [],
        wildcard: false
      });
    });

    it('should parse dynamic params', () => {
      const result = parseRoutePattern('/users/:id');
      expect(result.params).toEqual(['id']);
    });

    it('should parse catch-all routes', () => {
      const result = parseRoutePattern('/blog/**');
      expect(result.wildcard).toBe(true);
    });
  });

  describe('matchRoute', () => {
    it('should match static routes', () => {
      const match = matchRoute('/users', '/users');
      expect(match).not.toBeNull();
      expect(match?.params).toEqual({});
    });

    it('should extract dynamic params', () => {
      const match = matchRoute('/users/:id', '/users/123');
      expect(match?.params).toEqual({ id: '123' });
    });
  });
});
```

---

## 7. CLI 命令设计

### 7.1 命令列表

```bash
# 开发
ubean dev                    # 启动开发服务器
ubean dev --port 3000        # 指定端口
ubean dev --host 0.0.0.0     # 指定主机

# 构建
ubean build                  # 构建生产版本
ubean build --preset vercel  # 指定 preset 构建
ubean build --minify         # 压缩构建
ubean build --sourcemap      # 生成 sourcemap

# 准备/类型生成
ubean prepare                # 生成类型文件 (.ubean/ 目录)
ubean prepare --force        # 强制重新生成

# 预览
ubean preview                # 预览生产构建

# 初始化
ubean init                   # 在当前目录初始化 ubean 项目
ubean init my-app            # 创建新项目
```

### 7.2 CLI 框架使用 citty

```typescript
// src/cli/index.ts
import { defineCommand, runMain } from 'citty';
import { devCommand } from './commands/dev';
import { buildCommand } from './commands/build';
import { prepareCommand } from './commands/prepare';
import { previewCommand } from './commands/preview';

const main = defineCommand({
  meta: {
    name: 'ubean',
    version: version,
    description: 'Vue meta framework'
  },
  subCommands: {
    dev: devCommand,
    build: buildCommand,
    prepare: prepareCommand,
    preview: previewCommand
  }
});

void runMain(main);
```

---

## 8. 导出设计

### 8.1 package.json exports

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs"
    },
    "./handler": {
      "types": "./dist/runtime/handler.d.mts",
      "import": "./dist/runtime/handler.mjs"
    },
    "./openapi": {
      "types": "./dist/runtime/openapi.d.mts",
      "import": "./dist/runtime/internal/routes/openapi.mjs"
    },
    "./client": {
      "types": "./dist/runtime/client.d.mts",
      "import": "./dist/runtime/client.mjs",
      "browser": {
        "import": "./dist/runtime/client-browser.mjs"
      }
    },
    "./client-xhr": {
      "types": "./dist/runtime/client-xhr.d.mts",
      "browser": {
        "import": "./dist/runtime/client-xhr.mjs"
      }
    },
    "./internal": {
      "types": "./dist/runtime/internal-fetch.d.mts",
      "import": "./dist/runtime/internal-fetch.mjs"
    },
    "./cron": {
      "types": "./dist/runtime/cron.d.mts",
      "import": "./dist/runtime/cron.mjs"
    },
    "./response": {
      "types": "./dist/runtime/response.d.mts",
      "import": "./dist/runtime/response.mjs"
    },
    "./env": {
      "types": "./dist/runtime/env-public.d.mts",
      "import": "./dist/runtime/env-public.mjs",
      "browser": {
        "import": "./dist/runtime/env-public-client.mjs"
      }
    },
    "./_env": {
      "types": "./dist/runtime/env.d.mts",
      "import": "./dist/runtime/env.mjs"
    },
    "./pages": {
      "types": "./dist/pages/index.d.mts",
      "import": "./dist/pages/index.mjs"
    },
    "./devtools": {
      "types": "./dist/devtools/runtime.d.mts",
      "import": "./dist/devtools/runtime.mjs"
    },
    "./pages-protocol": {
      "types": "./dist/pages/protocol.d.mts",
      "import": "./dist/pages/protocol.mjs"
    },
    "./pages-head": {
      "types": "./dist/pages/head.d.mts",
      "import": "./dist/pages/head.mjs"
    },
    "./pages-client": {
      "types": "./dist/pages/client.d.mts",
      "import": "./dist/pages/client.mjs"
    },
    "./vue": {
      "types": "./dist/vue/client.d.mts",
      "import": "./dist/vue/client.mjs"
    },
    "./vue/app": {
      "types": "./dist/vue/app.d.mts",
      "import": "./dist/vue/app.mjs"
    },
    "./vue/plugin": {
      "types": "./dist/vue/plugin.d.mts",
      "import": "./dist/vue/plugin.mjs"
    },
    "./vue/runtime": {
      "types": "./dist/runtime/vue.d.mts",
      "import": "./dist/runtime/vue.mjs"
    },
    "./database": {
      "types": "./dist/runtime/database.d.mts",
      "import": "./dist/runtime/database.mjs"
    },
    "./storage": {
      "types": "./dist/runtime/storage.d.mts",
      "import": "./dist/runtime/storage.mjs"
    },
    "./kv": {
      "types": "./dist/runtime/kv.d.mts",
      "import": "./dist/runtime/kv.mjs"
    },
    "./cache": {
      "types": "./dist/runtime/cache.d.mts",
      "import": "./dist/runtime/cache.mjs"
    },
    "./sse": {
      "types": "./dist/runtime/sse.d.mts",
      "import": "./dist/runtime/sse.mjs"
    },
    "./ws": {
      "types": "./dist/runtime/websocket.d.mts",
      "import": "./dist/runtime/websocket.mjs"
    },
    "./task": {
      "types": "./dist/runtime/task.d.mts",
      "import": "./dist/runtime/task.mjs"
    },
    "./config": {
      "types": "./dist/runtime/config.d.mts",
      "import": "./dist/runtime/config.mjs"
    },
    "./vite": {
      "types": "./dist/core/build/vite/plugin.d.mts",
      "import": "./dist/core/build/vite/plugin.mjs"
    },
    "./builder": "./dist/builder.mjs",
    "./types": "./dist/types/index.mjs",
    "./routes": {
      "types": "./dist/routes-stub.d.mts"
    }
  },
  "bin": {
    "ubean": "./dist/cli/index.mjs"
  }
}
```

---

### 8.2 发布范围与平台能力契约

为避免“声明支持”与实际运行时语义不一致，版本支持分为**正式支持**、**实验性**和**社区/按需**三档。只有通过对应部署 smoke test 的 preset 才能进入正式支持列表。

| 版本  | 正式支持                 | 实验性                               | 不在承诺范围                          |
| ----- | ------------------------ | ------------------------------------ | ------------------------------------- |
| v0.1  | Node.js (`node-server`)  | Cloudflare Workers（完成单独验收后） | Bun、Deno、Vercel、Netlify 及其他平台 |
| v0.2+ | 由能力矩阵与 CI 结果决定 | 新增 preset 先以实验性发布           | 未通过矩阵验收的平台                  |

每个 preset 必须显式声明 `capabilities`，例如 `fs`、`cronTrigger`、`longLivedProcess`、`websocket`、`queue`、`isr` 和 `nodeCompat`。构建器根据已启用功能和 preset 能力做预检查：

- 能力缺失时在构建期给出功能、配置位置、目标 preset 与替代方案，不静默降级。
- cron 仅在具备平台 trigger 或长生命周期进程能力时启用；serverless preset 不提供“内置常驻调度器”。
- ISR、WebSocket、Queue、文件存储等功能必须在每个 preset 中声明其一致语义、限制和测试环境；不能保证一致语义时应作为 preset 扩展而非核心能力。

### 8.3 客户端与公开 API 边界

核心 HTTP 客户端以标准 Fetch API 为基础，确保浏览器、Node、Deno 与 edge runtime 的行为一致。`createClient` 与 `internalFetch` 共享请求、响应、错误和重试的中间件模型；`internalFetch` 直接调度框架 handler，不依赖网络或 axios adapter。

- `axios`/`axios-retry` 仅作为可选的浏览器或 Node 适配器包，不得进入 edge server bundle。
- OpenAPI 类型仅用于编译期参数与响应推导，运行时不加载 OpenAPI 文档。
- `exports` 分为稳定公开入口、`./experimental/*` 入口和私有实现；`./internal`、`./_env` 不作为稳定用户 API。
- 每次发布前使用 `pnpm pack` 安装到独立 fixture，验证所有公开入口、条件导出和类型声明。

---

## 9. 实现规范与参考资源

### 9.1 UI 组件规范 (DevTools)

DevTools 面板的 UI 实现必须使用 `@soybeanjs/ui` 组件库，遵循以下规范：

1. **组件库选择**：优先使用 `@soybeanjs/ui` 的预样式化 `S*` 组件（如 `SButton`、`SCard`、`STabs`、`STable`、`SInput`、`SModal` 等）
2. **样式引入**：使用时在入口文件引入样式：
   ```typescript
   import '@soybeanjs/ui/styles.css';
   ```
3. **自动导入配置**：通过 `unplugin-vue-components` 配合 `UiResolver` 实现自动导入：

   ```typescript
   import Components from 'unplugin-vue-components/vite';
   import { UiResolver } from '@soybeanjs/ui/resolver';

   Components({
     resolvers: [UiResolver()]
   });
   ```

4. **主题配置**：使用 `SConfigProvider` 进行全局主题、尺寸、语言配置
5. **参考文档**：
   - 本地 Skill: `~/.agents/skills/soybean-ui/`
   - 在线文档: `https://ui.soybeanjs.cn/`
   - 组件参考: `https://ui.soybeanjs.cn/llms.txt`

### 9.2 平台适配参考

各平台 (preset) 的适配实现必须优先参考以下开源项目：

1. **Nitro** (`/Users/soybean/Web/Projects/OpenSource/nitro`)
   - 参考 Nitro 的 preset 架构设计
   - 参考 Nitro 的平台能力检测与降级策略
   - 参考 Nitro 的构建输出结构和 runtime 适配
   - 重点关注：preset 定义、rollup 配置、runtime entry、平台特定 hooks

2. **Hono Vite Plugins** (`https://github.com/honojs/vite-plugins`)
   - 参考 Hono 官方 Vite 插件实现
   - 参考 dev server 集成模式
   - 参考 HMR 和热重载策略
   - 重点关注：vite-plugin 开发、dev 模式中间件、客户端注入

3. **参考原则**：
   - 不要直接复制代码，而是学习架构设计和实现模式
   - 保持 ubean 的 API 设计一致性
   - 所有适配层必须有对应的测试用例
   - 平台特定能力必须通过 capability 矩阵声明

### 9.3 依赖安装规范

- 使用 `pnpm` 作为包管理器，遵循 workspace catalog 版本管理
- UI 相关依赖（@soybeanjs/ui 等）仅在需要时引入，不强制用户安装
- DevTools 相关依赖作为 devDependencies 或按需动态导入

---
