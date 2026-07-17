<script setup lang="ts">
useHead({
  title: 'ubean-test - 首页'
});

useHead({
  title: 'ubean-test 功能测试首页',
  meta: [{ name: 'description', content: 'ubean 框架功能验证测试项目' }]
});
</script>

<template>
  <div class="home">
    <section class="hero">
      <h1>🧪 ubean-test</h1>
      <p class="subtitle">ubean 框架功能验证测试项目</p>
    </section>

    <section class="test-grid">
      <div class="test-card">
        <h3>📄 页面路由</h3>
        <ul>
          <li><Link to="/">首页</Link></li>
          <li><Link to="/about">关于页面</Link></li>
          <li><Link to="/features">功能列表</Link></li>
          <li><Link to="/user/1">动态路由 /user/[id]</Link></li>
        </ul>
      </div>

      <div class="test-card">
        <h3>🔌 API 路由</h3>
        <ul>
          <li><a href="/api/hello" target="_blank">GET /api/hello</a></li>
          <li><a href="/api/users" target="_blank">GET /api/users</a></li>
          <li><a href="/api/users/1" target="_blank">GET /api/users/[id]</a></li>
          <li><a href="/api/redirect" target="_blank">重定向测试</a></li>
          <li><a href="/api/error" target="_blank">错误处理测试</a></li>
        </ul>
      </div>

      <div class="test-card">
        <h3>⚙️ 服务端功能</h3>
        <ul>
          <li><a href="/api/env" target="_blank">环境变量 /api/env</a></li>
          <li><a href="/api/cors-status" target="_blank">CORS /api/cors-status</a></li>
          <li><a href="/api/health" target="_blank">健康检查 /api/health</a></li>
        </ul>
      </div>

      <div class="test-card">
        <h3>🌍 i18n 国际化</h3>
        <ul>
          <li>English</li>
          <li>简体中文</li>
        </ul>
      </div>

      <div class="test-card">
        <h3>🛠️ DevTools</h3>
        <ul>
          <li><a href="/_devtools" target="_blank">DevTools 面板</a></li>
          <li><a href="/_openapi.json" target="_blank">OpenAPI 规范</a></li>
          <li><a href="/_scalar" target="_blank">Scalar API 文档</a></li>
        </ul>
      </div>

      <div class="test-card">
        <h3>📝 其他测试</h3>
        <ul>
          <li><Link to="/md-test">Markdown 页面</Link></li>
          <li><a href="/robots.txt" target="_blank">robots.txt</a></li>
          <li><a href="/sitemap.xml" target="_blank">sitemap.xml</a></li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  margin-bottom: 3rem;
  padding: 2rem 0;
}

.hero h1 {
  font-size: 2.5rem;
  color: #42b883;
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1.2rem;
  color: #666;
}

.test-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.test-card {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid #e9ecef;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.test-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.test-card h3 {
  color: #35495e;
  margin-bottom: 1rem;
  font-size: 1.1rem;
}

.test-card ul {
  list-style: none;
  padding: 0;
}

.test-card li {
  padding: 0.4rem 0;
}

.test-card a {
  color: #42b883;
  text-decoration: none;
  font-size: 0.95rem;
}

.test-card a:hover {
  text-decoration: underline;
}
</style>
