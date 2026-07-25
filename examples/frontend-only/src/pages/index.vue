<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { createRequest } from '@soybeanjs/fetch';
import IslandCounter from '../components/IslandCounter.vue';

useHead({
  title: 'ubean frontend-only - 首页',
  meta: [{ name: 'description', content: 'frontend-only 示例:文件路由 + Islands + @soybeanjs/fetch' }]
});

interface JsonPlaceholderUser {
  id: number;
  name: string;
  email: string;
  website: string;
}

// 使用 @soybeanjs/fetch 创建请求实例,可调用任意外部 API
const request = createRequest({
  baseURL: 'https://jsonplaceholder.typicode.com'
});

const user = ref<JsonPlaceholderUser | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function loadUser() {
  loading.value = true;
  error.value = null;
  try {
    user.value = await request.get<JsonPlaceholderUser>('/users/1');
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(loadUser);
</script>

<template>
  <div class="home">
    <section class="hero">
      <h1>frontend-only</h1>
      <p class="subtitle">ubean 示例:无后端业务逻辑,仅页面路由 + Islands + SEO</p>
    </section>

    <section class="feature-grid">
      <div class="card">
        <h3>📄 文件式路由</h3>
        <ul>
          <li><Link to="/">首页 /</Link></li>
          <li><Link to="/about">关于 /about</Link></li>
          <li><Link to="/users/1">动态路由 /users/[id]</Link></li>
        </ul>
      </div>

      <div class="card">
        <h3>🏝️ Islands</h3>
        <p class="hint">
          下方计数器通过
          <code>client:load</code>
          指令水合,SSR 输出含
          <code>&lt;ubean-island&gt;</code>
          元素。
        </p>
        <IslandCounter client:load />
      </div>

      <div class="card">
        <h3>🌐 @soybeanjs/fetch</h3>
        <p class="hint">
          通过
          <code>createRequest</code>
          调用外部 API(jsonplaceholder)。
        </p>
        <button :disabled="loading" class="btn" @click="loadUser">
          {{ loading ? 'Loading...' : '重新获取 /users/1' }}
        </button>
        <pre v-if="user" class="result">{{ JSON.stringify(user, null, 2) }}</pre>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </section>

    <Link to="/about" class="back-link">关于本示例 →</Link>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  margin-bottom: 3rem;
  padding: 2rem 0;
}

.hero h1 {
  font-size: 2.5rem;
  color: #42b883;
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1.2rem;
  color: #666;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.card {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid #e9ecef;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.card h3 {
  color: #35495e;
  margin-bottom: 1rem;
  font-size: 1.1rem;
}

.card ul {
  list-style: none;
  padding: 0;
}

.card li {
  padding: 0.4rem 0;
}

.card a {
  color: #42b883;
  text-decoration: none;
  font-size: 0.95rem;
}

.card a:hover {
  text-decoration: underline;
}

.hint {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 0.8rem;
  line-height: 1.5;
}

.hint code {
  background: #e9ecef;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.8rem;
}

.btn {
  padding: 0.4rem 1rem;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn:hover:not(:disabled) {
  background: #35495e;
}

.btn:disabled {
  background: #aaa;
  cursor: not-allowed;
}

.result {
  margin-top: 0.8rem;
  padding: 0.8rem;
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.8rem;
}

.error {
  margin-top: 0.8rem;
  color: #dc2626;
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
