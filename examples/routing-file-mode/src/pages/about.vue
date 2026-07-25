<script setup lang="ts">
useHead({
  title: '关于 - routing-file-mode'
});
</script>

<template>
  <div class="about">
    <h1>关于 routing-file-mode</h1>
    <p>
      这是一个演示 ubean
      <strong>file 路由模式</strong>
      的最小示例项目。 与默认的 virtual 模式不同,file 模式会将路由数据写入实体文件,便于 IDE 跳转和手动编辑 meta。
    </p>

    <section class="info-section">
      <h2>file 模式特点</h2>
      <div class="feature-list">
        <div class="feature-item">
          <span class="check">✅</span>
          <span>
            IDE 可直接跳转到
            <code>routes.ts</code>
            查看路由定义
          </span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>
            支持手动修改
            <code>meta</code>
            字段(增量更新不覆盖)
          </span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>
            生成
            <code>typed-router.d.ts</code>
            提供路由名称强类型补全
          </span>
        </div>
        <div class="feature-item">
          <span class="check">✅</span>
          <span>同时支持页面路由和 API 路由</span>
        </div>
      </div>
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
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.9rem;
  color: #c0392b;
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
