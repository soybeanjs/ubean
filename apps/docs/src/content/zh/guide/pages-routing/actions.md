---
title: Actions
description: 了解 ubean 页面路由中的 Actions 表单提交处理机制。
status: translated-stub
---

# Actions

本页面尚未翻译完成，请暂参考 [English version](/guide/pages-routing/actions)。

翻译完成后此提示将被移除。

## 从旧语法迁移

`'use server'` 字符串指令已**移除**，改为显式调用 `defineAction(fn)` 包装器。Vite 插件 (`ubeanServerActionsPlugin`) 现在检测 `defineAction(` 调用表达式并自动注入 `filePath`/`name` 用于 action ID 生成。

```typescript
// 迁移前（已移除）：'use server' 字符串指令
'use server';

export async function createTodo(input: { title: string }) {
  await db.insert(todos).values(input);
  return { success: true };
}

// 迁移后：显式 defineAction() 包装器
import { defineAction } from 'ubean';

export const createTodo = defineAction(async (input: { title: string }) => {
  await db.insert(todos).values(input);
  return { success: true };
});
```
