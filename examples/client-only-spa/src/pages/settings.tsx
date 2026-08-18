import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { definePage } from '@ubean/vue';

/**
 * TSX 页面:默认页面扩展名 vue/tsx/jsx 之一,definePage 构建期提取
 * 与 .vue 完全一致(括号平衡扫描不受 JSX 语法影响)。
 * JSX 转译由 @vitejs/plugin-vue-jsx 提供(vite.config.ts)。
 */
definePage({ name: 'Settings', head: { title: '设置 - TSX 页面' } });

const theme = ref<'light' | 'dark'>('light');
const reducedMotion = ref(false);
const summary = computed(() => `theme=${theme.value}, reducedMotion=${reducedMotion.value}`);

export default {
  setup() {
    const route = useRoute();
    return () => (
      <section>
        <h1>设置(TSX 页面)</h1>
        <p class="subtitle">路由 /settings —— 文件 settings.tsx(definePage 提取一致)</p>
        <div class="card">
          <label>
            主题:
            <select value={theme.value} onChange={e => (theme.value = (e.target as HTMLSelectElement).value as 'light' | 'dark')}>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={reducedMotion.value} onChange={e => (reducedMotion.value = (e.target as HTMLInputElement).checked)} />
            减弱动效
          </label>
          <p class="mono">{summary.value}</p>
          <p class="mono">useRoute().fullPath = {route.fullPath}</p>
        </div>
      </section>
    );
  }
};
