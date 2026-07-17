<script setup lang="ts">
import IslandClock from '../components/IslandClock.vue';
import IslandCounter from '../components/IslandCounter.vue';
import IslandMedia from '../components/IslandMedia.vue';
import IslandOnly from '../components/IslandOnly.vue';
import IslandVisibility from '../components/IslandVisibility.vue';

useHead({
  title: 'Islands 架构测试 - ubean-test'
});
</script>

<template>
  <div class="islands-test-page">
    <h1>🏝️ Islands 架构测试</h1>
    <p class="desc">
      此页面验证 ubean 的 Islands 架构。每个 Island 使用不同的水合指令， SSR 输出中应包含
      <code>&lt;ubean-island&gt;</code>
      自定义元素。
    </p>

    <div class="islands-grid">
      <div class="island-section">
        <h2>client:load</h2>
        <p class="directive-hint">页面加载时立即水合</p>
        <IslandCounter client:load />
      </div>

      <div class="island-section">
        <h2>client:idle</h2>
        <p class="directive-hint">浏览器空闲时水合</p>
        <IslandClock client:idle />
      </div>

      <div class="island-section">
        <h2>client:visible</h2>
        <p class="directive-hint">滚动到可见区域时水合</p>
        <IslandVisibility client:visible />
      </div>

      <div class="island-section">
        <h2>client:media</h2>
        <p class="directive-hint">匹配媒体查询时水合 (min-width: 768px)</p>
        <IslandMedia client:media="(min-width: 768px)" />
      </div>

      <div class="island-section">
        <h2>client:only</h2>
        <p class="directive-hint">仅在客户端渲染（不进行 SSR）</p>
        <IslandOnly client:only />
      </div>
    </div>

    <div class="ssd-note">
      <h3>📌 SSR 验证说明</h3>
      <p>
        在 SSR 输出中（查看页面源码），所有非
        <code>client:only</code>
        的 Island 应包含服务端渲染的 HTML 内容，而
        <code>client:only</code>
        的 Island 应为空。 Bootstrap 脚本应注入到页面中，根据指令设置
        <code>data-hydrating</code>
        属性。
      </p>
    </div>

    <Link to="/" class="back-link">← 返回首页</Link>
  </div>
</template>

<style scoped>
.islands-test-page h1 {
  color: #42b883;
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.desc {
  color: #666;
  margin-bottom: 2rem;
  line-height: 1.6;
}

.desc code {
  background: #f1f5f9;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.85rem;
}

.islands-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.island-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.island-section h2 {
  font-size: 1.1rem;
  color: #35495e;
  margin: 0;
}

.directive-hint {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0;
}

.ssd-note {
  background: #f8fafc;
  border-left: 4px solid #42b883;
  padding: 1rem 1.5rem;
  margin: 2rem 0;
  border-radius: 0 8px 8px 0;
}

.ssd-note h3 {
  color: #35495e;
  font-size: 1rem;
  margin-bottom: 0.5rem;
}

.ssd-note p {
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.6;
}

.ssd-note code {
  background: #e2e8f0;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.85rem;
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
