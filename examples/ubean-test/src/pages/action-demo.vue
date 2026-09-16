<script lang="ts">
import { defineAction, fail } from 'ubean/server';

/**
 * 页面级 Server Action（P9-02）：`POST /action-demo?/subscribe`。
 *
 * 放在普通 `<script>` 块（不是 `<script setup>`）里 —— SFC 的具名导出只能出现在这里，
 * 而框架按「页面模块的 `actions` 具名导出」收集（见 `@ubean/routes` 的 `runPageAction`）。
 */
export const actions = {
  subscribe: defineAction(async (input: { email?: string }) => {
    const email = String(input.email ?? '').trim();
    if (!email.includes('@')) {
      // 字段级错误：无 JS 时由服务端回填到 `page.errors`，SPA 提交时走 `form.errors`
      return fail(400, { email: '请输入合法邮箱' });
    }
    return { subscribed: email, at: '2026-01-01T00:00:00.000Z' };
  })
};
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFormAction, usePage } from 'ubean/client';

definePage({
  name: 'action-demo',
  path: '/action-demo',
  meta: { title: 'Server Actions 演示' }
});

/**
 * 无 JS（渐进增强）路径：action 结果合并进页面 props、字段错误进 `page.errors`，都由服务端
 * 渲染进 HTML —— 与 SPA 提交共用同一个 action。
 */
const page = usePage<{ subscribed?: string; at?: string }>();
const serverResult = computed(() => page.props?.subscribed ?? null);
const serverError = computed(() => page.errors?.email ?? null);

const form = useFormAction('subscribe');
const log = ref<string[]>([]);

async function onSubmit(event: Event) {
  // `ActionResult` 形状是 `{ data?, error?, errors?, status }`（不是判别联合）：
  // 字段级错误走 `errors`、整体错误走 `error`，其余按成功处理。
  const result = await form.onSubmit(event);
  if (result.errors && Object.keys(result.errors).length > 0) return;
  if (result.error) return;
  const data = result.data as { subscribed?: string } | null;
  if (data?.subscribed) log.value = [...log.value, `已订阅：${data.subscribed}`];
}
</script>

<template>
  <section class="action-demo">
    <h1>Server Action 演示</h1>
    <p>
      表单经
      <code>useFormAction('subscribe')</code>
      提交到页面自身（
      <code>?/subscribe</code>
      ）； 禁用 JS 时浏览器原生提交、结果由服务端渲染 —— 两条路径共用同一个 action。
    </p>

    <form method="POST" :action="form.action" @submit.prevent="onSubmit">
      <label for="email">邮箱</label>
      <input id="email" name="email" type="email" placeholder="you@example.com" />
      <button type="submit" :disabled="form.pending.value">
        {{ form.pending.value ? '提交中…' : '订阅' }}
      </button>
    </form>

    <p v-if="form.errors.value?.email" class="action-error" role="alert">{{ form.errors.value.email }}</p>
    <p v-else-if="serverError" class="action-error" role="alert">{{ serverError }}</p>
    <p v-if="form.error.value" class="action-error" role="alert">{{ form.error.value.message }}</p>

    <p v-if="serverResult" class="action-server-result" role="status">服务端结果：{{ serverResult }}</p>

    <ul class="action-log">
      <li v-for="(line, index) in log" :key="index">{{ line }}</li>
    </ul>
  </section>
</template>
