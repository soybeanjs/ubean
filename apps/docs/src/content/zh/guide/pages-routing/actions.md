---
title: Actions
description: 用 defineAction 与 useAction 实现服务端 action 与表单 action。
---

# 服务端 Action 与表单 Action

ubean 内置服务端 action（Server Action，P9-02）—— 类型安全的服务端函数，可由客户端调用，并支持渐进增强。其设计对齐 Next.js、SvelteKit、SolidStart 与 Astro 中的同类模式。

## 核心 API

| API | 说明 |
| --- | --- |
| `defineAction(handlerOrSchema, handler?, opts?)` | 定义一个服务端 action |
| `fail(status, errors)` | 返回字段级校验错误（SvelteKit 风格） |
| `ActionError` | 用户可读的错误类（带 `code`/`status`） |
| `useAction(actionOrId)` | Vue composable（客户端） |
| `useFormAction(actionName)` | Vue composable（渐进增强表单） |
| `callAction(id, args)` | 底层 RPC 调用 |
| `defineAction(fn)` | 显式声明服务端 action（推荐）；Vite 插件会自动注入 `filePath`/`name` 用于生成 action ID |
| `defineServerFn(...)` | `defineAction` 的别名 —— 同一个 ID 与 `POST /__actions`；当该函数同时用作 loader/查询时使用 |
| `invokeServerFn(fn, input?)` | 从 loader、`useAsyncData` 或客户端发起的同构调用（`ubean/client`） |
| `describeActionsOpenApi()` | 同一个 `/__actions` RPC 的可选 OpenAPI 片段 |

## 1. defineAction —— 定义服务端 action

```typescript
// src/actions/auth.ts
import { defineAction } from 'ubean/server';
import { fail, ActionError } from 'ubean';

export const login = defineAction(async (input: { email: string; password: string }, ctx) => {
  if (input.password === 'wrong') {
    return fail(400, { password: 'incorrect' });
  }
  const user = await authenticate(input.email, input.password);
  if (!user) throw new ActionError('Invalid credentials', { code: 'INVALID_CREDENTIALS' });
  return { user, token: 'abc123' };
});
```

### 配合 schema 校验

支持任何兼容 Standard Schema v1 的库（valibot/zod/arktype 等），或任何实现了 `safeParse`/`parse` 方法的对象：

```typescript
import { defineAction } from 'ubean/server';
import * as v from 'valibot';

const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8))
});

export const register = defineAction(schema, async (data, ctx) => {
  // data 已完成校验，类型为 { email: string; password: string }
  return { registered: true, email: data.email };
});
```

## 2. useAction —— 从客户端调用

```vue
<script setup lang="ts">
import { useAction } from 'ubean/client';
import { login } from '~/actions/auth';

const { submit, pending, data, error, errors, reset } = useAction(login);

async function handleLogin() {
  const result = await submit({ email: 'alice@example.com', password: 'secret' });
  if (result.data) {
    // 成功
  } else if (result.errors) {
    // 字段级校验错误
  }
}
</script>

<template>
  <button :disabled="pending" @click="handleLogin">
    {{ pending ? 'Loading…' : 'Login' }}
  </button>
  <p v-if="errors?.password" class="error">{{ errors.password }}</p>
  <p v-else-if="error" class="error">{{ error.message }}</p>
</template>
```

`useAction` 返回：

- `pending: Ref<boolean>` —— 是否正在提交
- `data: Ref<TOutput | null>` —— 成功时的返回值
- `error: Ref<{ message, code? } | null>` —— `ActionError` 或抛出的异常
- `errors: Ref<Record<string, string> | null>` —— `fail()` 返回的字段错误
- `status: Ref<number>` —— HTTP 状态码
- `result: Ref<ActionResult | null>` —— 完整结果
- `submit(...args)` —— 触发调用
- `reset()` —— 重置状态

## 3. 显式 `defineAction()` 包装

Vite 插件（`ubeanServerActionsPlugin`）会识别 `defineAction(` 调用表达式，并自动注入 `filePath` 与 `name` 以生成 action ID：

```typescript
// src/actions/todos.ts
import { defineAction } from 'ubean/server';

export const createTodo = defineAction(async (input: { title: string }) => {
  await db.insert(todos).values(input);
  return { success: true };
});

export const deleteTodo = defineAction(async (id: string) => {
  await db.delete(todos).where(eq(todos.id, id));
  return { success: true };
});
```

- **服务端**：被 `defineAction()` 包装的函数会自动注册到全局 action 注册表
- **客户端**：该导出会被替换为 RPC 桩，调用时向 `/__actions` 发 POST 请求
- **action ID**：由 `act_` + `base32(fnv1a(filePath:exportName))` 生成（两个 FNV-1a 32 位哈希合并为 60 位 → 12 个小写 base32 字符）；Vite 插件自动注入 `filePath`/`name`，保证客户端与服务端一致

## 4. 表单 Action（渐进增强）

页面模块可以导出一个 `actions` 映射；POST 表单通过 `?/<actionName>` URL 分发（SvelteKit 风格）：

```vue
<!-- src/pages/login.vue -->
<script setup lang="ts">
import { defineAction } from 'ubean/server';
import { fail } from 'ubean';

export const actions = {
  default: defineAction(async (input) => {
    return { ok: true };
  }),
  login: defineAction(async (input: { email: string; password: string }) => {
    if (input.password === 'wrong') {
      return fail(400, { password: 'incorrect' });
    }
    return { user: input.email };
  }),
  register: defineAction(async (input: { email: string }) => {
    return { registered: true, email: input.email };
  })
};
</script>

<template>
  <!-- 没有 JS 也能用（原生 POST 表单） -->
  <form method="POST" action="?/login">
    <input name="email" type="email" required />
    <input name="password" type="password" required />
    <button type="submit">Login</button>
  </form>

  <!-- 或者用 useFormAction 走 SPA 式提交 -->
  <form @submit.prevent="onSubmit">
    <input name="email" v-model="email" type="email" required />
    <input name="password" v-model="password" type="password" required />
    <button :disabled="pending" type="submit">
      {{ pending ? 'Submitting…' : 'Login' }}
    </button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useFormAction } from 'ubean/client';

const email = ref('');
const password = ref('');
const { action, pending, onSubmit, data, errors } = useFormAction('login');
</script>
```

- `?/login` → 调用 `actions.login`
- `?/register` → 调用 `actions.register`
- 没有 `?/name` → 调用 `actions.default`
- 当表单 action 返回 `Response`（重定向）时，页面请求会自动转换为 JSON `{ redirect }` + `X-Ubean-Redirect` 响应头

## 5. action 返回值约定

| 场景 | 返回值 | 客户端 `result` |
| --- | --- | --- |
| 成功 | `return { ... }` | `{ data: { ... }, status: 200 }` |
| 字段错误 | `return fail(400, { field: 'msg' })` | `{ errors: { field: 'msg' }, status: 400 }` |
| 用户错误 | `throw new ActionError('msg', { code })` | `{ error: { message, code }, status: 400 }` |
| 重定向 | `return new Response(null, { status: 302, headers: { Location } })` | `{ data: { redirect }, status: 302 }` |
| 意外错误 | `throw new Error('boom')` | `{ error: { message: 'boom' }, status: 500 }` |

## 6. 传统 API 路由（替代方案）

服务端 action 面向表单提交与类型安全的 RPC 调用。如果需要 RESTful API 或需要 OpenAPI 文档，请改用 `defineHandler`：

```typescript
// src/routes/api/submit.ts
import { defineHandler, validator } from 'ubean/server';
import { z } from 'zod';

const submitSchema = z.object({
  name: z.string().min(1),
  email: z.string().email()
});

export const POST = defineHandler(
  validator('json', submitSchema),
  async c => {
    const { name, email } = c.req.valid('json');
    return c.json({ success: true, name, email });
  }
);
```

## 最佳实践

1. **schema 校验**：把 schema 作为 `defineAction` 的第一个参数传入，框架会自动校验输入
2. **渐进增强**：使用 `useFormAction` 时，确保原生 `<form method="POST" action="?/name">` 同样可用
3. **错误分类**：字段错误用 `fail()`（对表单友好），面向用户的错误用 `ActionError`
4. **action 文件位置**：`src/actions/` 目录，或在页面模块里内联 `export const actions`
5. **在 action 中通过 `defineEnv` 访问环境变量**：服务端 action 在 Node 与 Cloudflare Workers 上都会运行
