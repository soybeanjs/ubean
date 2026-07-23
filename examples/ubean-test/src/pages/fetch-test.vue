<script setup lang="ts">
import { ref } from 'vue';
import { api, flatApi } from '../request/client';

useHead({
  title: 'Typed Client Demo - ubean-test'
});

// ============================================================================
// 1. JSON 请求(默认 responseType: 'json')
// ============================================================================
const helloResult = ref<unknown>(null);
const helloError = ref<string>('');
const helloLoading = ref(false);

async function fetchHello() {
  helloLoading.value = true;
  helloError.value = '';
  helloResult.value = null;
  try {
    // 完全类型安全 — '/api/hello' 路径、参数、返回值均从 OpenAPI 推断
    const data = await api.get('/hello');
    helloResult.value = data;
  } catch (err) {
    helloError.value = err instanceof Error ? err.message : String(err);
  } finally {
    helloLoading.value = false;
  }
}

// ============================================================================
// 2. 带路径参数的 JSON 请求
// ============================================================================
const userId = ref(1);
const userResult = ref<unknown>(null);
const userError = ref<string>('');
const userLoading = ref(false);

async function fetchUser() {
  userLoading.value = true;
  userError.value = '';
  userResult.value = null;
  try {
    // path 参数 {id} 自动替换,pathParams 有类型约束
    const data = await api.get('/users/{id}', {
      pathParams: { id: String(userId.value) }
    });
    userResult.value = data;
  } catch (err) {
    userError.value = err instanceof Error ? err.message : String(err);
  } finally {
    userLoading.value = false;
  }
}

// ============================================================================
// 3. 文本响应(responseType: 'text')
// ============================================================================
const textResult = ref<string>('');
const textError = ref<string>('');
const textLoading = ref(false);

async function fetchText() {
  textLoading.value = true;
  textError.value = '';
  textResult.value = '';
  try {
    // responseType: 'text' 返回 string,而非 JSON 解析
    // 非 'json' 的 responseType 需 cast 绕过 OpenAPI 类型约束
    const text = (await (api as any).get('/api/text', { responseType: 'text' })) as string;
    textResult.value = text;
  } catch (err) {
    textError.value = err instanceof Error ? err.message : String(err);
  } finally {
    textLoading.value = false;
  }
}

// ============================================================================
// 4. 文件下载(responseType: 'blob')
// ============================================================================
const downloadInfo = ref<{ filename: string; contentType: string; size: number } | null>(null);
const downloadError = ref<string>('');
const downloadLoading = ref(false);

async function downloadFile() {
  downloadLoading.value = true;
  downloadError.value = '';
  downloadInfo.value = null;
  try {
    // responseType: 'blob' 返回 { file: Blob; filename: string; contentType: string }
    // 非 'json' 的 responseType 需 cast 绕过 OpenAPI 类型约束
    const result = (await (api as any).get('/api/download', {
      responseType: 'blob',
      query: { filename: 'demo-file.txt', contentType: 'text/plain' }
    })) as { file: Blob; filename: string; contentType: string };
    downloadInfo.value = {
      filename: result.filename,
      contentType: result.contentType,
      size: result.file.size
    };

    // 触发浏览器下载
    const url = URL.createObjectURL(result.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    downloadError.value = err instanceof Error ? err.message : String(err);
  } finally {
    downloadLoading.value = false;
  }
}

// ============================================================================
// 5. 扁平模式(不抛异常,通过返回值判断)
// ============================================================================
const flatResult = ref<{ data: unknown; error: string | null; status: number } | null>(null);

async function fetchFlat() {
  const { data, error, response } = await flatApi.get('/users');
  flatResult.value = {
    data,
    error: error ? error.message : null,
    status: response?.status ?? 0
  };
}
</script>

<template>
  <div class="fetch-test">
    <h1>类型化请求客户端 Demo</h1>
    <p class="subtitle">
      演示
      <code>src/request/client.ts</code>
      中
      <code>api</code>
      的用法 — 路径、参数、返回值均类型安全
    </p>

    <!-- 1. JSON -->
    <section>
      <h2>1. JSON 请求(默认)</h2>
      <button :disabled="helloLoading" @click="fetchHello">
        {{ helloLoading ? 'Loading...' : 'GET /api/hello' }}
      </button>
      <pre v-if="helloResult">{{ JSON.stringify(helloResult, null, 2) }}</pre>
      <p v-if="helloError" class="error">{{ helloError }}</p>
    </section>

    <!-- 2. 路径参数 -->
    <section>
      <h2>2. 路径参数</h2>
      <div class="row">
        <label>
          用户 ID:
          <input v-model.number="userId" type="number" min="1" />
        </label>
        <button :disabled="userLoading" @click="fetchUser">
          {{ userLoading ? 'Loading...' : 'GET /api/users/{id}' }}
        </button>
      </div>
      <pre v-if="userResult">{{ JSON.stringify(userResult, null, 2) }}</pre>
      <p v-if="userError" class="error">{{ userError }}</p>
    </section>

    <!-- 3. 文本 -->
    <section>
      <h2>3. 文本响应(responseType: 'text')</h2>
      <button :disabled="textLoading" @click="fetchText">
        {{ textLoading ? 'Loading...' : 'GET /api/text' }}
      </button>
      <pre v-if="textResult">{{ textResult }}</pre>
      <p v-if="textError" class="error">{{ textError }}</p>
    </section>

    <!-- 4. 文件下载 -->
    <section>
      <h2>4. 文件下载(responseType: 'blob')</h2>
      <button :disabled="downloadLoading" @click="downloadFile">
        {{ downloadLoading ? 'Downloading...' : 'GET /api/download' }}
      </button>
      <div v-if="downloadInfo" class="info">
        <p>
          <strong>filename:</strong>
          {{ downloadInfo.filename }}
        </p>
        <p>
          <strong>contentType:</strong>
          {{ downloadInfo.contentType }}
        </p>
        <p>
          <strong>size:</strong>
          {{ downloadInfo.size }} bytes
        </p>
      </div>
      <p v-if="downloadError" class="error">{{ downloadError }}</p>
    </section>

    <!-- 5. 扁平模式 -->
    <section>
      <h2>5. 扁平模式(createFlatTypedClient)</h2>
      <button @click="fetchFlat">GET /api/users(flat)</button>
      <pre v-if="flatResult">{{ JSON.stringify(flatResult, null, 2) }}</pre>
    </section>
  </div>
</template>

<style scoped>
.fetch-test {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.subtitle {
  color: #666;
  margin-bottom: 2rem;
}

section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid #eee;
  border-radius: 8px;
}

h1 {
  margin-bottom: 0.5rem;
}

h2 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

button {
  padding: 8px 16px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: #5568d3;
}

button:disabled {
  background: #aaa;
  cursor: not-allowed;
}

pre {
  margin-top: 1rem;
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.875rem;
}

.error {
  color: #e53e3e;
  margin-top: 1rem;
}

.info {
  margin-top: 1rem;
  padding: 1rem;
  background: #f0f9ff;
  border-radius: 4px;
}

code {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.875em;
}
</style>
