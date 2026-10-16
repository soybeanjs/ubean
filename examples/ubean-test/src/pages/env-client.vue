<script setup lang="ts">
import { EXAMPLE_API_PREFIX, EXAMPLE_APP_TITLE } from 'ubean:env/client';

/**
 * 客户端侧 `ubean:env/client` 夹具：字面量必须出现在 `dist/public` 里才算真的内联进客户端。
 * 必须是页面（而不是 `src/routes/api/*.ts`）——API 路由不进客户端模块图，那里断言
 * 「内联进客户端」是假阴性。
 */
useHead({ title: `env-client: ${EXAMPLE_APP_TITLE}` });

const clientEnv = { title: EXAMPLE_APP_TITLE, prefix: EXAMPLE_API_PREFIX };
</script>

<template>
  <div class="env-client-page">
    <h1>{{ clientEnv.title }}</h1>
    <p>{{ clientEnv.prefix }}</p>
  </div>
</template>
