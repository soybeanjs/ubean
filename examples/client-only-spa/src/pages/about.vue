<script lang="ts">
// 模块级挂载计数:跨组件实例持久 —— reload 会销毁并重建实例,
// 实例内的状态会随之重置,模块级变量才能观察"重挂载了几次"。
let totalMounts = 0;
</script>

<script setup lang="ts">
// 过渡与重载演示 —— definePage({ transition: 'fade' }) 声明页面级过渡(CSS 在 App.vue);
// reload 内部:隐藏页面(实例入缓存)→ 空窗口内剪除缓存条目 →
// bump 渲染 key 全新挂载并重新入缓存,全程不触碰活跃页的缓存成员关系。
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  definePage,
  useReloadSignal,
  getPageTransitionName,
  setPageTransition,
  clearPageTransition,
  usePage
} from '@ubean/vue';

definePage({ name: 'About', cache: true, transition: 'fade' });

const reload = useReloadSignal();
const transitionName = getPageTransitionName();
const route = useRoute();
const router = useRouter();
// 精简版 usePage():仅 pageData(props/component/errors)。
// 精简 SPA 无工厂注入 → 共享空对象;路由态用 useRoute()。
const pageData = usePage();

const mountSeq = ref(++totalMounts);

async function doReload() {
  await reload.reload('About');
}

function setFade() {
  setPageTransition('fade');
}

function clearTransition() {
  clearPageTransition();
}
</script>

<template>
  <section>
    <h1>过渡与重载控制</h1>
    <p class="subtitle">
      本页路由声明
      <code>meta.transition: 'fade'</code>
      ;全局过渡名可运行时切换。
    </p>

    <div class="card">
      <p>
        全局过渡名:
        <code class="mono">{{ transitionName || '(无)' }}</code>
      </p>
      <div class="row">
        <button type="button" @click="setFade">setPageTransition('fade')</button>
        <button type="button" @click="clearTransition">clearPageTransition</button>
      </div>
    </div>

    <div class="card">
      <p>
        重载计数:
        <strong>{{ reload.counter.value }}</strong>
      </p>
      <p>
        重载中:
        <strong>{{ reload.reloading.value }}</strong>
      </p>
      <p class="mono">本实例是 About 页第 {{ mountSeq }} 次挂载(reload 递增)</p>
      <div class="row">
        <button type="button" :disabled="reload.reloading.value" @click="doReload">reload.reload('About')</button>
        <button type="button" @click="router.push('/')">router.push('/')</button>
      </div>
    </div>

    <p class="hint">
      <code>useRoute().fullPath</code>
      =
      <code class="mono">{{ route.fullPath }}</code>
      (路由驱动);精简版
      <code>usePage()</code>
      仅 pageData —— component/props/errors 为
      <code class="mono">
        {{ String(pageData.component ?? '(空)') }}/{{ Object.keys(pageData.props ?? {}).length }}/{{
          pageData.errors === null ? 'null' : 'map'
        }}
      </code>
      (无工厂注入)。
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

.row button:disabled {
  opacity: 0.5;
  cursor: wait;
}

.mono {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 0.82rem;
}

.hint {
  margin-top: 1.25rem;
  font-size: 0.88rem;
  color: gray;
  line-height: 1.7;
}
</style>
