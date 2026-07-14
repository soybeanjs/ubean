<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  supportsViewTransitions,
  withViewTransition,
  useViewTransitionState,
  getNavigationType
} from 'ubean/runtime/vue';

definePage({
  head: {
    title: 'View Transitions 测试 - ubean-test'
  }
});

const supported = ref(false);
const navType = ref<string>('');
const transitionCount = ref(0);
const lastTransitionAt = ref<string>('');

onMounted(() => {
  supported.value = supportsViewTransitions();
  navType.value = getNavigationType();
});

async function triggerTransition() {
  await withViewTransition(
    () => {
      transitionCount.value++;
      lastTransitionAt.value = new Date().toISOString();
      return Promise.resolve();
    },
    { enabled: true, types: ['slide'] }
  );
  navType.value = getNavigationType();
}

async function triggerCrossfade() {
  await withViewTransition(
    () => {
      transitionCount.value++;
      lastTransitionAt.value = new Date().toISOString();
    },
    { enabled: true }
  );
}

const slideStyle = useViewTransitionState('vt-slide');
</script>

<template>
  <div class="vt-page">
    <h1>🎬 View Transitions 测试</h1>
    <p class="desc">
      验证 ubean 的 View Transitions API 集成，包括特性检测、
      <code>withViewTransition()</code>
      包装、Types API 和样式辅助。
    </p>

    <div class="vt-info">
      <div class="info-card">
        <h3>supportsViewTransitions()</h3>
        <p class="info-value" :class="{ supported, unsupported: !supported }">
          {{ supported ? '✓ Supported' : '✗ Not supported' }}
        </p>
      </div>

      <div class="info-card">
        <h3>getNavigationType()</h3>
        <p class="info-value">{{ navType }}</p>
      </div>

      <div class="info-card">
        <h3>Transition count</h3>
        <p class="info-value">{{ transitionCount }}</p>
      </div>

      <div v-if="lastTransitionAt" class="info-card">
        <h3>Last transition</h3>
        <p class="info-value mono">{{ lastTransitionAt }}</p>
      </div>
    </div>

    <div class="vt-actions">
      <button :disabled="!supported" class="vt-btn primary" @click="triggerTransition">Trigger Slide Transition</button>
      <button :disabled="!supported" class="vt-btn secondary" @click="triggerCrossfade">Trigger Crossfade</button>
    </div>

    <div class="vt-demo">
      <h3>useViewTransitionState() 样式</h3>
      <pre class="code-block">{{ slideStyle }}</pre>
      <div class="demo-box" :style="slideStyle.style">This box has view-transition-name: vt-slide</div>
    </div>

    <div v-if="!supported" class="vt-warning">
      <p>⚠️ 当前浏览器不支持 View Transitions API。请使用 Chrome 111+ 或 Edge 111+。</p>
    </div>

    <Link to="/" class="back-link">← 返回首页</Link>
  </div>
</template>

<style scoped>
.vt-page h1 {
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

.vt-info {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.info-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
}

.info-card h3 {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.info-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1e293b;
}

.info-value.supported {
  color: #166534;
}

.info-value.unsupported {
  color: #991b1b;
}

.info-value.mono {
  font-size: 0.8rem;
  font-family: monospace;
  word-break: break-all;
}

.vt-actions {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.vt-btn {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.vt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.vt-btn.primary {
  background: #42b883;
  color: white;
}

.vt-btn.primary:hover:not(:disabled) {
  background: #35495e;
}

.vt-btn.secondary {
  background: #6366f1;
  color: white;
}

.vt-btn.secondary:hover:not(:disabled) {
  background: #4f46e5;
}

.vt-demo {
  margin-bottom: 2rem;
}

.vt-demo h3 {
  color: #35495e;
  font-size: 1rem;
  margin-bottom: 0.5rem;
}

.code-block {
  background: #1e293b;
  color: #e2e8f0;
  padding: 0.8rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: monospace;
  overflow-x: auto;
  margin-bottom: 0.8rem;
}

.demo-box {
  padding: 1rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border-radius: 8px;
  text-align: center;
  font-weight: 600;
}

.vt-warning {
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  padding: 1rem 1.5rem;
  border-radius: 0 8px 8px 0;
  margin: 1.5rem 0;
}

.vt-warning p {
  color: #92400e;
  font-size: 0.9rem;
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
