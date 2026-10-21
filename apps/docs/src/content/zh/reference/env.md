---
title: 环境变量
description: "用 defineEnv 定义类型安全的环境变量：校验、公开暴露与 CLI 命令。"
translatedFrom: c2c600c79ac1
sections: ["215750ed","e3b0c442","1cba358b","daf35096","0cda17da","887acb77","aad04242","a4fb6757","3c53e3d6","4a1e5efa","1524b4ee","3034f10d","8583952a","3ffa46ef","0a089a70","b739fdf4"]
---

# 环境变量

ubean 提供 `defineEnv()` 用于类型安全的环境变量校验。schema 定义在项目文件（如 `env.ts`）中，服务端与客户端共用。

## defineEnv()

```typescript
// env.ts
import { defineEnv, envField } from 'ubean';

export const { env } = defineEnv({
  schema: {
    DATABASE_URL: envField.string({ context: 'server', access: 'secret' }),
    PORT: envField.number({ context: 'server', access: 'public', default: 9527 }),
    DEBUG: envField.boolean({ context: 'server', access: 'secret', default: false })
  }
});
```

`defineEnv()` 接收单个配置对象，含两个顶层字段：

| 字段    | 类型                | 说明                                                       |
| ------- | ------------------- | ---------------------------------------------------------- |
| schema  | EnvSchema           | 字段表，每个字段自带 `context` / `access` 维度              |
| mode    | `'warn' \| 'throw'` | 校验失败时的行为（默认 `'warn'` —— 仅记录日志，不抛错）     |

### 维度

每个字段声明值在哪一侧可用、是否敏感。合法组合只有三种：

| `context` | `access` | 可读侧          | 声明在                  |
| --------- | -------- | --------------- | ----------------------- |
| `client`  | `public` | 客户端 + 服务端 | `ubean:env/client`      |
| `server`  | `public` | 仅服务端        | `ubean:env/server`      |
| `server`  | `secret` | 仅服务端        | `ubean:env/server`      |

`client` + `secret` 在声明时直接抛错 —— 配置期失败，最早的可失败点。

分组糖（`server:` / `public:`）已**删除**。维度写在字段上，同一个字段挪位置不会静默换语义。构造函数形态（`{ type: String }`）仍可在 `schema` 下解析，但没有维度可读，按 `server + secret` 处理 —— 要在客户端可读就显式声明 `envField.*()`。

### Schema 条目

`envField.*()` 覆盖四种类型：

| 构造器                 | 输出类型             |
| ---------------------- | -------------------- |
| `envField.string(...)` | `string`             |
| `envField.number(...)` | `number`             |
| `envField.boolean(...)`| `boolean`            |
| `envField.enum(...)`   | 声明的 `values` 联合 |

都接受 `context`、`access` 与可选的 `default` / `optional`；`envField.enum` 额外要求 `values`。

空字符串视为「没配」—— `.env` 里写 `KEY=` 时 `default` 生效。

### zod / valibot 校验

`defineEnv()` 也接受 Standard Schema（`~standard`）与 `safeParse` 形态，因为它与校验器同进程：

```typescript
import { defineEnv } from 'ubean';
import { z } from 'zod';

export const { env } = defineEnv({
  schema: { JWT_SECRET: z.string().min(32) }
});
```

校验必须**同步** —— 异步 schema 会以明确的错误失败。

`ubean.config.ts` 的 `env.schema` **不是**这样：那些字段最终写进生成的源码模块，只装得下平数据。在那里传运行期 schema 会在配置期抛错。

## 使用环境变量

### 服务端

通过 `defineEnv()` 返回的 `env` 代理读取已校验的值：

```typescript
// src/routes/api/hello.ts
import { defineHandler } from 'ubean/server';
import { env } from '../../env';

export const GET = defineHandler(c => {
  return c.json({ port: env.PORT, dbUrl: env.DATABASE_URL });
});
```

服务端代码中同样可以直接读 `process.env`。

### 客户端

把字段声明为 `context: 'client', access: 'public'`，它的值会在构建期内联进客户端产物：

```typescript
import { APP_NAME } from 'ubean:env/client';
```

`import.meta.env.VITE_*` 对偏好的代码保持可用。Vite 自己的 `import.meta.env` 仍需 `VITE_` 前缀；`ubean:env/client` 不需要，因为构建插件直接读 `.env`。

客户端代码 import `ubean:env/server` 会**构建失败**，而不是替换成空对象 —— 静默降级会把「缺少密钥」变成后面某一行上的 `undefined`，那时根因已经消失。

## CLI 命令

`ubean env` 管理 `.env` 文件中的变量（纯键/值行）：

```bash
# 根据模板创建 .env 与 .env.example
ubean env init

# 列出变量（--public 只显示公开变量）
ubean env list
ubean env list --public

# 新增或更新变量（--public 会加上 UBEAN_PUBLIC_ 前缀）
ubean env add DATABASE_URL "postgres://localhost:5432/ubean"
ubean env add API_URL "/api" --public
ubean env add API_URL "/api" --force   # 覆盖已有值

# 删除变量
ubean env remove DATABASE_URL
```

CLI 把 `UBEAN_PUBLIC_`、`VITE_`、`PUBLIC_` 前缀当作「公开」。这是 `.env` 文件的命名约定，服务于 CLI 的 `list --public` / `add --public` 两个开关 —— 与 `env.schema` 里的 `context` / `access` **相互独立**。真正决定值能否进客户端产物的是后者。

## 校验

### 校验模式

设置 `mode: 'throw'` 可在启动时快速失败——只要必填变量缺失或类型不符就抛错；默认的 `'warn'` 只记录错误：

```typescript
export const { env } = defineEnv({
  schema: {
    DATABASE_URL: envField.string({ context: 'server', access: 'secret' })
  },
  mode: 'throw' // DATABASE_URL 缺失时启动即抛错
});
```

### 手动校验

在返回值上调用 `.validate()`，可校验自定义来源（例如测试夹具或按请求区分的 env）：

```typescript
const { validate } = defineEnv({
  schema: { DATABASE_URL: envField.string({ context: 'server', access: 'secret' }) }
});

const result = validate(source); // source: Record<string, string | undefined>
if (!result.success) {
  console.error(result.errors); // [{ key, message, value }]
}
```

## TypeScript 支持

`env` 代理是全类型化的：`InferEnvOutput<S>` 会从每个字段推导出 `string` / `number` / `boolean`（或 enum 联合），因此 `env.DATABASE_URL` 直接就是 `string` 类型，无需额外的声明文件。`ubean:env/*` 虚拟模块的类型生成在 `.ubean/env.d.ts` —— 不要手写。

## 最佳实践

1. **绝不提交密钥**：密钥放在 `.env.local`（已被 gitignore）；改为提交 `.env.example`
2. **敏感值一律标 `access: 'secret'`**：`client` + `secret` 会被拒绝，配置加载器和类型系统各拦一层
3. **启动时校验**：生产部署建议用 `mode: 'throw'`
4. **提供默认值**：为可选变量设置 `default`
5. **记录变量**：在 schema 中加注释，保留每个变量的意图
