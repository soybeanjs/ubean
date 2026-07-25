<script setup lang="ts">
useHead({
  title: 'routing-file-mode - 首页'
});
</script>

<template>
  <div class="home">
    <section class="hero">
      <h1>📁 routing-file-mode</h1>
      <p class="subtitle">ubean file 模式示例 — 路由数据以实体文件形式生成</p>
    </section>

    <section class="info-card">
      <h3>📌 这个示例演示了什么?</h3>
      <p>
        本项目在
        <code>ubean.config.ts</code>
        中启用了
        <code>routing.mode: 'file'</code>
        ,ubean 会将扫描到的页面/布局路由数据写入
        <code>src/router/_generated/</code>
        目录,而不是仅注册虚拟模块。
      </p>
      <p class="hint">
        运行
        <code>pnpm dev</code>
        或
        <code>pnpm build</code>
        后,生成器会自动产出:
      </p>
      <ul class="file-list">
        <li>
          <code>src/router/_generated/routes.ts</code>
          — 扁平 RouteRecord[]
        </li>
        <li>
          <code>src/router/_generated/imports.ts</code>
          — 懒加载 views 与 layouts 记录
        </li>
        <li>
          <code>src/router/_generated/typed-router.d.ts</code>
          — 路由名称/路径类型
        </li>
      </ul>
    </section>

    <section class="info-card">
      <h3>🔗 文件式路由工作正常</h3>
      <ul class="link-list">
        <li><Link to="/">首页 /</Link></li>
        <li><Link to="/about">关于 /about</Link></li>
        <li><Link to="/users/1">动态路由 /users/1</Link></li>
      </ul>
    </section>

    <section class="info-card">
      <h3>💡 提示</h3>
      <p>
        查看
        <code>src/router/_generated/routes.ts</code>
        (运行 dev/build 后生成)以了解路由数据结构。 你可以手动编辑其中路由记录的
        <code>meta</code>
        字段,生成器采用增量更新,不会覆盖你的修改。
      </p>
      <p>
        同时,API 路由依然可用:
        <a href="/api/hello" target="_blank">GET /api/hello</a>
      </p>
    </section>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  margin-bottom: 2rem;
  padding: 2rem 0;
}

.hero h1 {
  font-size: 2.2rem;
  color: #42b883;
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1.1rem;
  color: #666;
}

.info-card {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid #e9ecef;
  margin-bottom: 1.5rem;
}

.info-card h3 {
  color: #35495e;
  margin-bottom: 0.8rem;
  font-size: 1.1rem;
}

.info-card p {
  color: #555;
  line-height: 1.7;
  margin-bottom: 0.6rem;
}

.info-card p.hint {
  margin-top: 0.8rem;
  margin-bottom: 0.4rem;
}

.info-card code {
  background: #e9ecef;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.9rem;
  color: #c0392b;
}

.file-list,
.link-list {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
}

.file-list li,
.link-list li {
  padding: 0.35rem 0;
}

.file-list code {
  background: #e9ecef;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #c0392b;
}

.link-list a {
  color: #42b883;
  text-decoration: none;
  font-size: 0.95rem;
}

.link-list a:hover {
  text-decoration: underline;
}

.info-card a {
  color: #42b883;
  text-decoration: none;
}

.info-card a:hover {
  text-decoration: underline;
}
</style>
