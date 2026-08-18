<script setup lang="ts">
// 应用外壳 = 布局(精简内核无布局扫描,App.vue 直接承担)。
// Link/PageView 为全局组件(ubeanVue 插件注册),类型见 src/typings/globals.d.ts。
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="layout">
    <header class="header">
      <nav class="nav">
        <Link to="/" class="logo">@ubean/vue</Link>
        <div class="nav-links">
          <Link to="/">首页</Link>
          <Link to="/users">用户</Link>
          <Link to="/docs">文档</Link>
          <Link to="/blog">博客</Link>
          <Link to="/dashboard">仪表盘</Link>
          <Link to="/guide">指南</Link>
          <Link to="/settings">设置</Link>
          <Link to="/cache-demo">缓存</Link>
          <Link to="/about">关于</Link>
          <button class="back-btn" type="button" @click="router.back()">← back</button>
        </div>
      </nav>
    </header>
    <main class="main">
      <!-- 页面渲染出口:keep-alive / transition / reload 信号都在这里生效 -->
      <PageView />
    </main>
    <footer class="footer">
      <p>standalone SPA · 只依赖 @ubean/vue(vue + vue-router)</p>
    </footer>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #fafafa;
  color: #24292f;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(135deg, #42b883, #35495e);
  padding: 0 20px;
}

.nav {
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
}

.logo {
  color: white;
  font-size: 1.2rem;
  font-weight: 700;
  text-decoration: none;
  font-family: 'SF Mono', ui-monospace, monospace;
}

.nav-links {
  display: flex;
  gap: 0.95rem;
  align-items: center;
  flex-wrap: wrap;
}

.nav-links a {
  color: rgba(255, 255, 255, 0.88);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.88rem;
}

.nav-links a.router-link-active {
  color: white;
  text-decoration: underline;
  text-underline-offset: 6px;
}

.back-btn {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: white;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.8rem;
  cursor: pointer;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.main {
  flex: 1;
  max-width: 960px;
  margin: 0 auto;
  padding: 40px 20px;
  width: 100%;
}

.footer {
  border-top: 1px solid rgba(128, 128, 128, 0.25);
  color: gray;
  text-align: center;
  padding: 1.2rem;
  font-size: 0.85rem;
}

/* about 路由声明的页面级过渡(meta.transition: 'fade') */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
