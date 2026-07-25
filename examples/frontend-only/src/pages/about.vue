<script setup lang="ts">
useHead({
  title: '关于 - frontend-only',
  meta: [{ name: 'description', content: 'frontend-only 示例说明:展示的能力与未使用的后端能力' }]
});
</script>

<template>
  <div class="about">
    <h1>关于 frontend-only 示例</h1>
    <p>
      此示例演示一个
      <strong>不含后端业务逻辑</strong>
      的 ubean 项目结构。SSR 仍保留用于 SEO, 但没有任何
      <code>src/routes/</code>
      (API 路由)、
      <code>src/crons/</code>
      (定时任务)、
      <code>src/middleware/</code>
      (后端中间件)或
      <code>src/server.ts</code>
      (服务端钩子)。
    </p>

    <section class="info-section">
      <h2>✅ 本示例展示的能力</h2>
      <div class="feature-list">
        <div class="feature-item enabled">
          <span class="check">✅</span>
          <span>文件式路由(src/pages/*.vue)</span>
        </div>
        <div class="feature-item enabled">
          <span class="check">✅</span>
          <span>布局系统(src/layouts/)</span>
        </div>
        <div class="feature-item enabled">
          <span class="check">✅</span>
          <span>SSR 服务端渲染(用于 SEO)</span>
        </div>
        <div class="feature-item enabled">
          <span class="check">✅</span>
          <span>Islands 架构(client:load 等指令)</span>
        </div>
        <div class="feature-item enabled">
          <span class="check">✅</span>
          <span>View Transitions API</span>
        </div>
        <div class="feature-item enabled">
          <span class="check">✅</span>
          <span>@soybeanjs/fetch 调用外部 API</span>
        </div>
        <div class="feature-item enabled">
          <span class="check">✅</span>
          <span>useHead / SEO meta</span>
        </div>
        <div class="feature-item enabled">
          <span class="check">✅</span>
          <span>Link 客户端导航</span>
        </div>
      </div>
    </section>

    <section class="info-section">
      <h2>🚫 未使用的后端能力</h2>
      <div class="feature-list">
        <div class="feature-item disabled">
          <span class="cross">❌</span>
          <span>API 路由(src/routes/)</span>
        </div>
        <div class="feature-item disabled">
          <span class="cross">❌</span>
          <span>定时任务(src/crons/)</span>
        </div>
        <div class="feature-item disabled">
          <span class="cross">❌</span>
          <span>后端中间件(src/middleware/)</span>
        </div>
        <div class="feature-item disabled">
          <span class="cross">❌</span>
          <span>服务端钩子(src/server.ts)</span>
        </div>
        <div class="feature-item disabled">
          <span class="cross">❌</span>
          <span>数据库 / 队列 / WebSocket / SSE</span>
        </div>
        <div class="feature-item disabled">
          <span class="cross">❌</span>
          <span>类型化内部 fetch(createServerApi)</span>
        </div>
        <div class="feature-item disabled">
          <span class="cross">❌</span>
          <span>OpenAPI / Scalar 文档</span>
        </div>
        <div class="feature-item disabled">
          <span class="cross">❌</span>
          <span>i18n 路由(本示例未启用)</span>
        </div>
      </div>
    </section>

    <section class="info-section">
      <h2>🔮 未来计划(Phase 7+)</h2>
      <p class="note">
        在 Phase 7 之后,ubean 将支持真正的
        <strong>SPA 模式</strong>
        (完全无 SSR), 适用于纯前端应用(如内部工具、管理后台、不需要 SEO 的应用)。 届时本示例可切换为 SPA 模式,无需 SSR
        也能运行。
      </p>
    </section>

    <Link to="/" class="back-link">← 返回首页</Link>
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
  font-size: 1.05rem;
  line-height: 1.7;
  margin-bottom: 2rem;
}

.about code {
  background: #e9ecef;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.9em;
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
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.6rem;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  font-size: 0.95rem;
  color: #444;
}

.feature-item.enabled {
  background: #f0f9f4;
}

.feature-item.disabled {
  background: #fef2f2;
  color: #6b7280;
}

.check,
.cross {
  font-size: 1rem;
}

.note {
  background: #f8fafc;
  border-left: 4px solid #42b883;
  padding: 1rem 1.5rem;
  border-radius: 0 8px 8px 0;
  color: #475569;
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
