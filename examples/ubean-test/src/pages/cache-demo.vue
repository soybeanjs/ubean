<script setup lang="ts">
import { ref, onActivated, onDeactivated, onMounted } from 'vue';

// 声明式缓存：通过 definePage({ cache: true }) 让此页面被 keep-alive 缓存。
// 离开页面时组件实例保留，返回时状态恢复（不会重新执行 setup）。
// 同时通过 meta.transition 配置页面切换动画名称（与 PageView 配合）。
definePage({
  cache: true,
  meta: { title: 'Page Cache Demo', transition: 'fade-slide' }
});

useHead({
  title: 'Page Cache Demo - ubean',
  meta: [{ name: 'description', content: 'Demonstrates keep-alive page caching with enablePageCache / disablePageCache / resetRouteCache / reloadPage' }]
});

// 这个计数器会在离开页面后被保留（因为 cache: true）
const counter = ref(0);
const activatedCount = ref(0);
const deactivatedCount = ref(0);
const mountTime = ref<string>('');
const lastActivatedAt = ref<string>('');
const reloadCount = ref(0);

function now(): string {
  return new Date().toLocaleTimeString();
}

onMounted(() => {
  mountTime.value = now();
  lastActivatedAt.value = mountTime.value;
});

// keep-alive 激活时触发（从其他页面返回此页面）
onActivated(() => {
  activatedCount.value++;
  lastActivatedAt.value = now();
});

// keep-alive 停用时触发（离开此页面去其他页面）
onDeactivated(() => {
  deactivatedCount.value++;
});

// --- 运行时缓存控制演示 ---
// 这些 API 也可以从 'ubean/runtime/vue' 显式导入，这里靠 auto-import
const cachedViews = useCacheViews();
const transition = usePageTransition();
const reloadSignal = useReloadSignal();

const runtimeToggleTarget = 'About'; // 控制是否缓存 about 页面

function toggleAboutCache() {
  if (isPageCached(runtimeToggleTarget)) {
    disablePageCache(runtimeToggleTarget);
  } else {
    enablePageCache(runtimeToggleTarget);
  }
}

function toggleAboutExclude() {
  if (isPageExcluded(runtimeToggleTarget)) {
    includePageCache(runtimeToggleTarget);
  } else {
    excludePageCache(runtimeToggleTarget);
  }
}

function invalidateAll() {
  invalidatePageCache();
}

// 重载当前页面：内部会调用 resetRouteCache 暂时排除缓存，再触发 remount
async function reloadCurrentPage() {
  reloadCount.value++;
  await reloadPage('CacheDemo');
}

// 全局过渡动画配置
const transitionPresets = ['', 'fade', 'fade-slide', 'zoom-fadein', 'none'] as const;

function setGlobalTransition(name: string) {
  setPageTransition(name);
}
</script>

<template>
  <div class="p-8 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-2">Page Cache Demo</h1>
    <p class="text-gray-500 mb-6">
      此页面通过 <code>definePage(&#123; cache: true &#125;)</code> 启用 keep-alive 缓存，并通过
      <code>meta.transition</code> 配置切换动画。离开再返回时，下方计数器和挂载时间会被保留。
    </p>

    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">缓存状态</h2>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="p-3 bg-gray-100 rounded">
          <div class="text-gray-500">首次挂载</div>
          <div class="font-mono">{{ mountTime || '(未挂载)' }}</div>
        </div>
        <div class="p-3 bg-gray-100 rounded">
          <div class="text-gray-500">最近一次激活</div>
          <div class="font-mono">{{ lastActivatedAt || '(未激活)' }}</div>
        </div>
        <div class="p-3 bg-green-100 rounded">
          <div class="text-gray-500">onActivated 次数</div>
          <div class="font-mono text-green-700">{{ activatedCount }}</div>
        </div>
        <div class="p-3 bg-orange-100 rounded">
          <div class="text-gray-500">onDeactivated 次数</div>
          <div class="font-mono text-orange-700">{{ deactivatedCount }}</div>
        </div>
      </div>
      <div class="mt-4 flex items-center gap-4 flex-wrap">
        <button
          class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          @click="counter++"
        >
          计数器: {{ counter }}
        </button>
        <button
          class="px-4 py-2 rounded"
          :class="reloadSignal.reloading.value ? 'bg-gray-400 text-white cursor-wait' : 'bg-purple-500 text-white hover:bg-purple-600'"
          :disabled="reloadSignal.reloading.value"
          @click="reloadCurrentPage"
        >
          {{ reloadSignal.reloading.value ? '重载中...' : `重载页面 (${reloadCount})` }}
        </button>
        <Link to="/" class="text-blue-500 hover:underline">← 去首页</Link>
        <Link to="/about" class="text-blue-500 hover:underline">去 About →</Link>
      </div>
      <p class="mt-3 text-sm text-gray-500">
        点击「重载页面」会调用 <code>reloadPage('CacheDemo')</code>，内部先
        <code>resetRouteCache</code> 暂时把当前页面加入 exclude 列表清空缓存实例，
        再通过 reload signal 触发组件重新挂载。
      </p>
    </section>

    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">运行时缓存控制</h2>
      <p class="text-sm text-gray-600 mb-3">
        即使页面未声明 <code>cache: true</code>，也可以在运行时通过 <code>enablePageCache</code> /
        <code>disablePageCache</code> 动态启用/禁用缓存；通过 <code>excludePageCache</code> /
        <code>includePageCache</code> 控制 exclude 列表（强制下次访问时不命中缓存）。
      </p>
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <button
          class="px-4 py-2 rounded"
          :class="isPageCached(runtimeToggleTarget) ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-green-500 text-white hover:bg-green-600'"
          @click="toggleAboutCache"
        >
          {{ isPageCached(runtimeToggleTarget) ? '禁用 About 缓存 (include)' : '启用 About 缓存 (include)' }}
        </button>
        <button
          class="px-4 py-2 rounded"
          :class="isPageExcluded(runtimeToggleTarget) ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-amber-400 text-white hover:bg-amber-500'"
          @click="toggleAboutExclude"
        >
          {{ isPageExcluded(runtimeToggleTarget) ? '取消 About 排除' : '排除 About (exclude)' }}
        </button>
        <button
          class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          @click="invalidateAll"
        >
          清空所有缓存
        </button>
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="p-3 bg-gray-100 rounded">
          <div class="text-gray-500 mb-1">当前 include 列表：</div>
          <div class="font-mono break-all">
            {{ cachedViews.cachedViews.value.length > 0 ? cachedViews.cachedViews.value.join(', ') : '(空)' }}
          </div>
        </div>
        <div class="p-3 bg-gray-100 rounded">
          <div class="text-gray-500 mb-1">当前 exclude 列表：</div>
          <div class="font-mono break-all">
            {{ cachedViews.excludedViews.value.length > 0 ? cachedViews.excludedViews.value.join(', ') : '(空)' }}
          </div>
        </div>
      </div>
    </section>

    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">全局过渡动画</h2>
      <p class="text-sm text-gray-600 mb-3">
        通过 <code>usePageTransition()</code> /
        <code>setPageTransition(name)</code> 可以在运行时配置全局页面切换动画。
        优先级：<code>&lt;PageView :transition&gt;</code> &gt; <code>route.meta.transition</code> &gt; 全局 <code>usePageTransition</code>。
      </p>
      <div class="flex items-center gap-2 mb-3 flex-wrap">
        <button
          v-for="name in transitionPresets"
          :key="name"
          class="px-3 py-1.5 rounded text-sm"
          :class="transition.name.value === name ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'"
          @click="setGlobalTransition(name)"
        >
          {{ name === '' ? '(无)' : name }}
        </button>
      </div>
      <div class="p-3 bg-gray-100 rounded text-sm">
        <div class="text-gray-500 mb-1">当前全局动画名称：</div>
        <div class="font-mono">{{ transition.name.value || '(空 - 不使用全局动画)' }}</div>
        <div class="text-gray-500 mt-2 mb-1">本页 meta.transition（优先于全局）：</div>
        <div class="font-mono">fade-slide</div>
      </div>
    </section>
  </div>
</template>

<style>
/* 定义一些常用的过渡动画 - 实际项目通常放在全局 CSS 中 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.zoom-fadein-enter-active,
.zoom-fadein-leave-active {
  transition: all 0.25s ease;
}
.zoom-fadein-enter-from {
  opacity: 0;
  transform: scale(0.95);
}
.zoom-fadein-leave-to {
  opacity: 0;
  transform: scale(1.05);
}
</style>
