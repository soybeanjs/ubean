import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { ubeanVueVite } from '@ubean/vue/vite';
import { defineConfig } from 'vitest/config';

/**
 * vitest 配置 —— 与 vite.config.ts 同一插件链,
 * 使 `virtual:ubean-vue-routes` 虚拟模块在测试中同样可导入。
 */
export default defineConfig({
  resolve: {
    // pnpm peer-variant duplication can install multiple copies of vue-router
    // (example's own copy vs @ubean/vue's copy). vue-router's injection keys
    // are per-instance Symbols, so RouterLink/PageView fail to inject the
    // router context in tests. Dedupe to a single instance.
    dedupe: ['vue', 'vue-router']
  },
  plugins: [vue(), vueJsx(), ubeanVueVite({ markdown: true, head: true })],
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000
  }
});
