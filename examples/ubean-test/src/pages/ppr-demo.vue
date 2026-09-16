<script lang="ts">
export async function loader() {
  return { from: 'ppr-loader' };
}
</script>

<script setup lang="ts">
definePage({
  name: 'PprDemo',
  meta: { title: 'PPR Demo' }
});
</script>

<template>
  <section class="ppr-demo">
    <h1>PPR Demo</h1>
    <p class="ppr-body">routeRules.ppr 强制流式 SSR，并纳入预渲染发现。</p>
  </section>
</template>
