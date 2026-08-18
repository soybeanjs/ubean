import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { ubeanVueVite } from '@ubean/vue/vite';
import { defineConfig } from 'vitest/config';

/**
 * vitest 配置 —— 与 vite.config.ts 同一插件链,
 * 使 `virtual:ubean-vue-routes` 虚拟模块在测试中同样可导入。
 */
export default defineConfig({
  plugins: [vue(), vueJsx(), ubeanVueVite({ markdown: true, head: true })],
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000
  }
});
