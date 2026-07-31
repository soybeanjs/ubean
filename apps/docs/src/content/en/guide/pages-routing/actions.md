---
title: Actions
---

# Server Actions & Form Actions

ubean provides built-in Server Actions (P9-02) — type-safe server-side functions invoked from the client with progressive enhancement support. Aligns with patterns from Next.js, SvelteKit, SolidStart, and Astro.

## Core API

| API | 说明 |
| --- | --- |
| `defineAction(handlerOrSchema, handler?, opts?)` | 定义服务端 action |
| `fail(status, errors)` | 返回字段级验证错误（SvelteKit 风格） |
| `ActionError` | 用户可读错误类（含 `code`/`status`） |
| `useAction(actionOrId)` | Vue composable（客户端） |
| `useFormAction(actionName)` | Vue composable（表单渐进增强） |
| `callAction(id, args)` | 底层 RPC 调用 |
| `'use server'` 指令 | Vite 插件自动转换 |

## 1. defineAction — 定义服务端 action

```typescript
// src/actions/auth.ts
import { defineAction, fail, ActionError } from 'ubean';

export const login = defineAction(async (input: { email: string; password: string }, ctx) => {
  if (input.password === 'wrong') {
    return fail(400, { password: 'incorrect' });
  }
  const user = await authenticate(input.email, input.password);
  if (!user) throw new ActionError('Invalid credentials', { code: 'INVALID_CREDENTIALS' });
  return { user, token: 'abc123' };
});
```

### 带 schema 验证

支持任何 Standard Schema v1 兼容库（valibot/zod/arktype 等）或有 `safeParse`/`parse` 方法的对象：

```typescript
import { defineAction } from 'ubean';
import * as v from 'valibot';

const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8))
});

export const register = defineAction(schema, async (data, ctx) => {
  // data 已验证，类型为 { email: string; password: string }
  return { registered: true, email: data.email };
});
```

## 2. useAction — 客户端调用

```vue
<script setup lang="ts">
import { useAction } from 'ubean/runtime/vue';
import { login } from '~/actions/auth';

const { submit, pending, data, error, errors, reset } = useAction(login);

async function handleLogin() {
  const result = await submit({ email: 'alice@example.com', password: 'secret' });
  if (result.data) {
    // 成功
  } else if (result.errors) {
    // 字段级验证错误
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
- `pending: Ref<boolean>` — 提交中
- `data: Ref<TOutput | null>` — 成功返回值
- `error: Ref<{ message, code? } | null>` — `ActionError` 或异常
- `errors: Ref<Record<string, string> | null>` — `fail()` 返回的字段错误
- `status: Ref<number>` — HTTP 状态码
- `result: Ref<ActionResult | null>` — 完整结果
- `submit(...args)` — 触发调用
- `reset()` — 重置状态

## 3. `'use server'` 指令

在模块顶部或函数前添加 `'use server'` 指令，Vite 插件自动转换：

```typescript
// src/actions/todos.ts
'use server';

export async function createTodo(input: { title: string }) {
  await db.insert(todos).values(input);
  return { success: true };
}

export async function deleteTodo(id: string) {
  await db.delete(todos).where(eq(todos.id, id));
  return { success: true };
}
```

- **Server 端**：导出被 `defineAction()` 包裹，自动注册到全局 action 注册表
- **Client 端**：导出被替换为 RPC stub，调用时 POST 到 `/__actions`
- **Action ID**：由 `base32(sha1(filePath:exportName))` 生成，client/server 自动一致

也支持函数级指令：

```typescript
export async function createTodo(input: { title: string }) {
  'use server';
  // ...
}
```

## 4. Form Actions（渐进增强）

页面模块可导出 `actions` map，POST 表单通过 `?/<actionName>` URL 分发（SvelteKit 风格）：

```vue
<!-- src/pages/login.vue -->
<script setup lang="ts">
import { defineAction, fail } from 'ubean';

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
  <!-- 不带 JS 也能工作（原生 POST 表单） -->
  <form method="POST" action="?/login">
    <input name="email" type="email" required />
    <input name="password" type="password" required />
    <button type="submit">Login</button>
  </form>

  <!-- 或用 useFormAction 做 SPA 式提交 -->
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
import { useFormAction } from 'ubean/runtime/vue';

const email = ref('');
const password = ref('');
const { action, pending, submit, data, errors } = useFormAction('login');

async function onSubmit(event: Event) {
  const form = event.target as HTMLFormElement;
  await submit(new FormData(form));
}
</script>
```

- `?/login` → 调用 `actions.login`
- `?/register` → 调用 `actions.register`
- 无 `?/name` → 调用 `actions.default`
- 表单 action 返回 `Response`（重定向）时，页面请求自动转换为 JSON `{ redirect }` + `X-Ubean-Redirect` header

## 5. Action 返回值约定

| 场景 | 返回值 | 客户端 `result` |
| --- | --- | --- |
| 成功 | `return { ... }` | `{ data: { ... }, status: 200 }` |
| 字段错误 | `return fail(400, { field: 'msg' })` | `{ errors: { field: 'msg' }, status: 400 }` |
| 用户错误 | `throw new ActionError('msg', { code })` | `{ error: { message, code }, status: 400 }` |
| 重定向 | `return new Response(null, { status: 302, headers: { Location } })` | `{ response, status: 302 }` |
| 未知异常 | `throw new Error('boom')` | `{ error: { message: 'boom' }, status: 500 }` |

## 6. 传统 API 路由（替代方案）

Server Actions 适用于表单提交和类型安全的 RPC 调用。对于 RESTful API 或需要 OpenAPI 文档的场景，仍使用 `defineHandler`：

```typescript
// src/routes/api/submit.ts
import { defineHandler, validator } from 'ubean';
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

1. **Schema 验证**：在 `defineAction` 第一个参数传 schema，框架自动验证输入
2. **渐进增强**：用 `useFormAction` 时确保原生 `<form method="POST" action="?/name">` 也能工作
3. **错误分类**：用 `fail()` 返回字段错误（表单友好），用 `ActionError` 抛用户错误
4. **Action 文件位置**：`src/actions/` 目录或页面模块内联 `export const actions`
5. **不要在 action 中直接访问 `process`**：Server Actions 运行在 Node 和 Cloudflare Workers 上
