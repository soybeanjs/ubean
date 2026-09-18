<script setup lang="ts">
// Client Component 用作**表格行**：占位符必须是注释节点。
// 旧实现渲染 `<div data-client-only>`，而 `<tr>` 里不允许 div —— 浏览器会把占位符提到表格之外，
// 于是 DOM 与客户端 vnode 树错位、水合 mismatch（dev 下 Vue 直接报 node mismatch）。
// 这条夹具在 dev-dx 里做回归守卫：水合后必须是**表格内**的一行。
const cells = ['row-a', 'row-b'];
</script>

<template>
  <td class="co-cell">{{ cells[0] }}</td>
  <td class="co-cell">{{ cells[1] }}</td>
</template>
