import { defineApp } from 'ubean/runtime/vue';
import "uno.css";

export default defineApp({
  head: {
    title: 'ubean — Full-stack Vue Meta-framework',
    meta: [
      { name: 'description', content: 'ubean is a full-stack Vue meta-framework built on Vite, Hono and Vue.' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' }
    ],
    htmlAttrs: { lang: 'en' }
  },
  rootId: 'app'
});
