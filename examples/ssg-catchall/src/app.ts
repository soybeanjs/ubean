import { defineApp } from 'ubean/runtime/vue';

export default defineApp({
  head: {
    title: 'ubean SSG catch-all',
    meta: [
      { name: 'description', content: 'ubean SSG 示例:catch-all 动态路由 + preview 静态服务器' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' }
    ]
  },
  rootId: 'app'
});
