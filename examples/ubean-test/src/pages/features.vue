<script setup lang="ts">
useHead({
  title: '功能列表 - ubean-test'
});
</script>

<template>
  <div class="features-page">
    <h1>功能测试列表</h1>
    <p class="desc">点击链接可以直接测试对应功能点。</p>

    <div class="api-test-section">
      <h2>🔌 API 接口测试</h2>

      <div class="test-group">
        <h3>基础响应</h3>
        <div class="test-links">
          <a href="/api/hello" target="_blank" class="test-btn get">GET /api/hello</a>
          <a href="/api/json" target="_blank" class="test-btn get">GET /api/json</a>
          <a href="/api/text" target="_blank" class="test-btn get">GET /api/text</a>
          <a href="/api/html" target="_blank" class="test-btn get">GET /api/html</a>
        </div>
      </div>

      <div class="test-group">
        <h3>动态路由与参数</h3>
        <div class="test-links">
          <a href="/api/users" target="_blank" class="test-btn get">GET /api/users (列表)</a>
          <a href="/api/users/1" target="_blank" class="test-btn get">GET /api/users/1</a>
          <a href="/api/users/999" target="_blank" class="test-btn get">GET /api/users/999 (不存在)</a>
        </div>
      </div>

      <div class="test-group">
        <h3>重定向</h3>
        <div class="test-links">
          <a href="/api/redirect" target="_blank" class="test-btn redirect">/api/redirect → /api/hello</a>
        </div>
      </div>

      <div class="test-group">
        <h3>错误处理</h3>
        <div class="test-links">
          <a href="/api/error" target="_blank" class="test-btn error">GET /api/error (500)</a>
          <a href="/api/notfound" target="_blank" class="test-btn error">GET /api/notfound (404)</a>
        </div>
      </div>

      <div class="test-group">
        <h3>环境变量 & 健康检查</h3>
        <div class="test-links">
          <a href="/api/env" target="_blank" class="test-btn get">GET /api/env</a>
          <a href="/api/health" target="_blank" class="test-btn get">GET /api/health</a>
        </div>
      </div>

      <div class="test-group">
        <h3>CORS</h3>
        <div class="test-links">
          <a href="/api/cors-status" target="_blank" class="test-btn get">GET /api/cors-status</a>
        </div>
      </div>

      <div class="test-group">
        <h3>SEO</h3>
        <div class="test-links">
          <a href="/robots.txt" target="_blank" class="test-btn get">GET /robots.txt</a>
          <a href="/sitemap.xml" target="_blank" class="test-btn get">GET /sitemap.xml</a>
        </div>
      </div>
    </div>

    <div class="page-test-section">
      <h2>📄 页面路由测试</h2>
      <div class="test-links">
        <Link to="/" class="test-btn page">首页 /</Link>
        <Link to="/about" class="test-btn page">关于 /about</Link>
        <Link to="/user/1" class="test-btn page">动态 /user/[id]</Link>
        <Link to="/md-test" class="test-btn page">Markdown /md-test</Link>
      </div>
    </div>

    <div class="page-test-section">
      <h2>🏝️ 客户端功能测试</h2>
      <div class="test-links">
        <Link to="/islands-test" class="test-btn island">Islands 架构</Link>
        <Link to="/view-transitions" class="test-btn island">View Transitions</Link>
      </div>
    </div>

    <div class="page-test-section">
      <h2>🛠️ DevTools</h2>
      <div class="test-links">
        <a href="/_devtools" target="_blank" class="test-btn dev">DevTools 面板</a>
        <a href="/_openapi.json" target="_blank" class="test-btn dev">OpenAPI JSON</a>
        <a href="/_scalar" target="_blank" class="test-btn dev">Scalar UI</a>
      </div>
    </div>

    <Link to="/" class="back-link">← 返回首页</Link>
  </div>
</template>

<style scoped>
.features-page h1 {
  color: #42b883;
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.desc {
  color: #666;
  margin-bottom: 2rem;
}

.test-group {
  margin-bottom: 1.5rem;
}

.test-group h3 {
  color: #555;
  font-size: 1rem;
  margin-bottom: 0.6rem;
  font-weight: 600;
}

.api-test-section h2,
.page-test-section h2 {
  color: #35495e;
  font-size: 1.3rem;
  margin: 2rem 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e9ecef;
}

.test-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.test-btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.test-btn.get {
  background: #e3f2fd;
  color: #1565c0;
}
.test-btn.get:hover {
  background: #bbdefb;
}

.test-btn.post {
  background: #e8f5e9;
  color: #2e7d32;
}

.test-btn.redirect {
  background: #fff3e0;
  color: #e65100;
}

.test-btn.error {
  background: #ffebee;
  color: #c62828;
}

.test-btn.page {
  background: #f3e5f5;
  color: #7b1fa2;
}

.test-btn.dev {
  background: #eceff1;
  color: #37474f;
}

.test-btn.island {
  background: #e0f2fe;
  color: #0369a1;
}

.test-btn.island:hover {
  background: #bae6fd;
}

.back-link {
  display: inline-block;
  margin-top: 2rem;
  color: #42b883;
  text-decoration: none;
  font-weight: 500;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
