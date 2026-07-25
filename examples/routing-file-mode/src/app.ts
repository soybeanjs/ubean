import { defineApp } from 'ubean/runtime/vue';

export default defineApp({
  head: {
    title: 'ubean routing-file-mode',
    meta: [
      { name: 'description', content: 'Demonstrates physical route file generation' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' }
    ]
  },
  rootId: 'app'
});
