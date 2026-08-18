<script setup lang="ts">
// 全部显式导入 —— 精简内核不提供自动引入。
// definePage 声明由 @ubean/vue/vite 编译期提取(构建后此调用被剥除)。
import { ref } from 'vue';
import { definePage } from '@ubean/vue';

// 文件即路由:pages/index.vue → '/',name 覆盖文件派生的 'Index' 为 'Home'
definePage({ name: 'Home' });

const mountedAt = ref(new Date().toLocaleTimeString());

const features = [
  { name: '文件式路由', desc: 'pages/ 目录即路由表,definePage 声明 name/cache/transition —— 全部编译期提取' },
  { name: 'ubeanVue 插件', desc: 'app.use(ubeanVue, { routes }) — 组件注册 + 缓存播种,一步完成' },
  { name: '原生 createRouter', desc: '内核不产出 router 工厂,直接用 vue-router createRouter 组装生成的路由表' },
  {
    name: '页面缓存 keep-alive',
    desc: 'definePage({ cache: true }) 声明式播种 + enablePageCache/disablePageCache 运行时控制'
  },
  { name: '过渡与重载', desc: 'definePage({ transition }) 页面级过渡 + reloadPage 强制重挂载' },
  { name: '零负担依赖', desc: '运行时仅 vue + vue-router —— 无 i18n/head/SEO,产物零 node: 模块' }
];
</script>

<template>
  <section>
    <h1>@ubean/vue 独立 SPA</h1>
    <p class="subtitle">精简客户端内核:路由 / 页面缓存 / 过渡动画 —— 插件式接入,显式导入</p>

    <ul class="features">
      <li v-for="f in features" :key="f.name">
        <strong>{{ f.name }}</strong>
        <span>{{ f.desc }}</span>
      </li>
    </ul>

    <p class="hint">
      前往
      <Link to="/cache-demo">缓存演示</Link>
      体验 keep-alive 页面缓存;前往
      <Link to="/about">关于</Link>
      查看 reload/transition 控制。外部链接:
      <Link to="https://vuejs.org">vuejs.org</Link>
    </p>
    <p class="mono">App setup 执行于 {{ mountedAt }}</p>
  </section>
</template>

<style scoped>
h1 {
  font-size: 1.8rem;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: gray;
  margin-bottom: 1.5rem;
}

.features {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.9rem;
}

.features li {
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 10px;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.features strong {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 0.9rem;
}

.features span {
  font-size: 0.85rem;
  color: gray;
  line-height: 1.5;
}

.hint {
  margin-top: 1.5rem;
  font-size: 0.9rem;
}

.mono {
  margin-top: 0.75rem;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 0.8rem;
  color: gray;
}
</style>
