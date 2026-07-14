<script setup lang="ts">
defineSlots<{
  default?: () => unknown;
}>();
</script>

<template>
  <div class="layout">
    <header class="header">
      <nav class="nav">
        <Link to="/" class="logo">ubean-test</Link>
        <div class="nav-links">
          <Link to="/">首页</Link>
          <Link to="/about">关于</Link>
          <Link to="/features">功能测试</Link>
        </div>
      </nav>
    </header>
    <main class="main">
      <slot />
    </main>
    <footer class="footer">
      <p>ubean 功能测试项目</p>
    </footer>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
  font-size: 1.3rem;
  font-weight: 700;
  text-decoration: none;
}

.nav-links {
  display: flex;
  gap: 1.5rem;
}

.nav-links a {
  color: rgba(255, 255, 255, 0.9);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.95rem;
  transition: color 0.2s;
}

.nav-links a:hover {
  color: white;
}

.main {
  flex: 1;
  max-width: 960px;
  margin: 0 auto;
  padding: 40px 20px;
  width: 100%;
}

.footer {
  background: #2c3e50;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  padding: 1.2rem;
}

.footer p {
  margin: 0;
  font-size: 0.9rem;
}
</style>
