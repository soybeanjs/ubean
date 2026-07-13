<script setup lang="ts">
definePage({
  meta: {
    title: '关于 - ubean-test'
  }
});
</script>

<template>
  <div class="about">
    <h1>关于 ubean-test</h1>
    <p>这是一个用于验证 ubean 框架各项功能的测试项目。</p>

    <section class="info-section">
      <h2>测试的功能模块</h2>
      <div class="feature-list">
        <div class="feature-item">
          <span class="check">✅</span>
          <span>文件系统路由 (API + Pages)</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>布局系统 (Layouts)</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>SSR 服务端渲染</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>客户端导航</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>API 路由与验证器</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>中间件系统</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>环境变量管理 (defineEnv)</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>定时任务 (Cron)</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>国际化 (i18n)</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>错误处理</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>响应工具 (json/text/html/redirect)</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>SEO (robots/sitemap)</span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>DevTools</span>
        </div>
      </div>
    </section>

    <a href="/" class="back-link">← 返回首页</a>
  </div>
</template>

<style scoped>
.about h1 {
  color: #42b883;
  font-size: 2rem;
  margin-bottom: 1rem;
}

.about p {
  color: #555;
  font-size: 1.1rem;
  line-height: 1.7;
  margin-bottom: 2rem;
}

.info-section {
  margin: 2rem 0;
}

.info-section h2 {
  color: #35495e;
  font-size: 1.4rem;
  margin-bottom: 1.2rem;
  border-bottom: 2px solid #42b883;
  padding-bottom: 0.5rem;
}

.feature-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.6rem;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.8rem;
  background: #f0f9f4;
  border-radius: 6px;
  font-size: 0.95rem;
  color: #444;
}

.check {
  font-size: 1rem;
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
