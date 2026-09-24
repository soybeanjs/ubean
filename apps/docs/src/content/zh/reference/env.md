---
title: 环境变量
description: "用 defineEnv 定义类型安全的环境变量：校验、公开暴露与 CLI 命令。"
---

# 环境变量

ubean 提供 `defineEnv()` 用于类型安全的环境变量校验。schema 定义在项目文件（如 `env.ts`）中，服务端与客户端共用。

## defineEnv()

```typescript
// env.ts
import { defineEnv } from 'ubean';

export const { env } = defineEnv({
  server: {
    DATABASE_URL: {
      type: String,
      required: true
    },
    PORT: {
      type: Number,
      default: 9527
    },
    DEBUG: {
      type: Boolean,
      default: false
    }
  }
});
```

`defineEnv()` 接收单个配置对象，含三个顶层字段：

| 字段    | 类型                 | 说明                                                       |
| -------- | -------------------- | ----------------------------------------------------------------- |
| server   | EnvSchema            | 仅服务端可见的变量（永不暴露给客户端）               |
| public   | EnvSchema            | 公开变量（经 `import.meta.env` 暴露给客户端）    |
| mode     | `'warn' \| 'throw'`  | 校验失败时的行为（默认 `'warn'` —— 仅记录日志，不抛错） |

### Schema 条目

每个条目通过**构造函数**（`String`、`Number`、`Boolean`）声明变量类型，另可带可选的 `default` 与 `required`：

| 选项     | 类型                          | 说明                         |
| ---------- | ----------------------------- | ----------------------------------- |
| `type`     | `String \| Number \| Boolean` | 变量类型（构造函数）         |
| `default`  | string \| number \| boolean   | 未设置时的默认值              |
| `required` | boolean                       | 缺失则校验失败          |

只有暴露同步 `safeParse` 的 schema 才能作为条目值。仅实现 Standard Schema 的对象（有 `~standard` 但没有 `safeParse`）目前会以明确的错误校验失败——异步 schema 请改用 `validate()`。

### 示例

```typescript
// env.ts
import { defineEnv } from 'ubean';

export const { env } = defineEnv({
  server: {
    DATABASE_URL: { type: String, required: true },
    API_KEY: { type: String, required: true }
  },
  public: {
    APP_NAME: { type: String, default: 'ubean-app' },
    API_URL: { type: String, default: '/api' }
  },
  mode: 'throw'
});
```

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

只有以 `UBEAN_PUBLIC_`、`VITE_` 或 `PUBLIC_` 为前缀的变量才会经 `import.meta.env` 暴露给客户端：

```vue
<script setup lang="ts">
const appName = import.meta.env.UBEAN_PUBLIC_APP_NAME;
const apiUrl = import.meta.env.VITE_API_URL;
</script>
```

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

公开变量通过 `UBEAN_PUBLIC_`、`VITE_` 或 `PUBLIC_` 前缀自动识别。

## 校验

### 校验模式

设置 `mode: 'throw'` 可在启动时快速失败——只要必填变量缺失或类型不符就抛错；默认的 `'warn'` 只记录错误：

```typescript
export const { env } = defineEnv({
  server: {
    DATABASE_URL: { type: String, required: true }
  },
  mode: 'throw' // DATABASE_URL 缺失时启动即抛错
});
```

### 手动校验

在返回值上调用 `.validate()`，可校验自定义来源（例如测试夹具或按请求区分的 env）：

```typescript
const { validate } = defineEnv({
  server: { DATABASE_URL: { type: String, required: true } }
});

const result = validate(source); // source: Record<string, string | undefined>
if (!result.success) {
  console.error(result.errors); // [{ key, message, value }]
}
```

## TypeScript 支持

`env` 代理是全类型化的：`InferEnvOutput<S>` 会依据每个条目的构造函数推导出 `string` / `number` / `boolean`，因此 `env.DATABASE_URL` 直接就是 `string` 类型，无需额外的声明文件。

## 最佳实践

1. **绝不提交密钥**：密钥放在 `.env.local`（已被 gitignore）；改为提交 `.env.example`
2. **使用 `UBEAN_PUBLIC_` 前缀**：只向客户端暴露必要的变量
3. **启动时校验**：生产部署建议用 `mode: 'throw'`
4. **提供默认值**：为可选变量设置 `default`
5. **记录变量**：在 `defineEnv` schema 中加注释
