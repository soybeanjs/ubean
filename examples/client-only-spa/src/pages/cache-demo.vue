<script setup lang="ts">
// 页面缓存演示 —— definePage({ name: 'CacheDemo', cache: true }) 由 vite 插件
// 编译期提取,等价于旧手写路由的 meta: { pageName: 'CacheDemo', cache: true }。
import { ref, onActivated } from 'vue';
import { definePage, useCacheViews, disablePageCache, enablePageCache, isPageCached, resetRouteCache } from '@ubean/vue';

definePage({ name: 'CacheDemo', cache: true });

const cached = useCacheViews();
const count = ref(0);
const mountedAt = ref(new Date().toLocaleTimeString());

// 缓存命中时,离开再回来不会重新执行 setup —— mountedAt 不变;
// disablePageCache 后再离开回来,mountedAt 会刷新(实例被销毁重建)。
// KeepAlive 缓存页用 onActivated/onDeactivated 替代 onMounted/onUnmounted。
onActivated(() => {});

function bump() {
  count.value++;
}

async function resetCache() {
  // 剪掉当前缓存实例:include 移除 → 离开本页时实例销毁;
  // 路由 afterEach 自动恢复声明,再次进入时全新挂载并重新入缓存。
  await resetRouteCache('CacheDemo');
}
</script>

<template>
  <section>
    <h1>页面缓存(keep-alive)演示</h1>
    <p class="subtitle">
      路由 meta 声明 <code>pageName: 'CacheDemo', cache: true</code>
      —— 与全栈 ubean 的 <code>definePage({'{'} cache: true {'}'})</code> 等价。
    </p>

    <div class="card">
      <p>组件内计数器:<strong>{{ count }}</strong></p>
      <p class="mono">setup 执行于 {{ mountedAt }}</p>
      <div class="row">
        <button type="button" @click="bump">count + 1</button>
        <button type="button" @click="disablePageCache('CacheDemo')">disablePageCache</button>
        <button type="button" @click="enablePageCache('CacheDemo')">enablePageCache</button>
        <button type="button" @click="resetCache">resetRouteCache</button>
      </div>
    </div>

    <div class="status">
      <p>
        isPageCached('CacheDemo') =
        <strong :class="isPageCached('CacheDemo') ? 'ok' : 'no'">
          {{ isPageCached('CacheDemo') }}
        </strong>
      </p>
      <p class="mono">cachedViewNames = [{{ cached.cachedViewNames.value.join(', ') }}]</p>
      <p class="mono">excludedViews = [{{ cached.excludedViews.value.join(', ') }}]</p>
    </div>

    <p class="hint">
      操作步骤:点击 count 几次 → 通过导航离开再回来。缓存开启时计数与 mountedAt 保留;
      点击 disablePageCache 后离开再回来,状态归零。resetRouteCache
      剪除缓存实例 —— 离开本页即销毁,再次进入时全新挂载(缓存声明自动恢复)。
    </p>
  </section>
</template>

<style scoped>
h1 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: gray;
  margin-bottom: 1.25rem;
  font-size: 0.92rem;
}

.card {
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 10px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
}

.row {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.row button {
  cursor: pointer;
  border: 1px solid rgba(66, 184, 131, 0.6);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  padding: 5px 12px;
}

.status p {
  margin: 0.25rem 0;
}

.ok {
  color: #16a34a;
}

.no {
  color: #dc2626;
}

.mono {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 0.82rem;
  color: gray;
}

.hint {
  margin-top: 1.25rem;
  font-size: 0.88rem;
  color: gray;
  line-height: 1.6;
}
</style>
