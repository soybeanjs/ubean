<script setup lang="ts">
// 全文检索验证页:useContentSearch 从 SSG 构建产物 __search.json 加载
// sections,fallback 引擎 + Intl.Segmenter CJK 分词(无需安装任何搜索依赖)。
import { ref } from 'vue';
import { useContentSearch } from '@ubean/content/vue';

defineOptions({ name: 'SearchPage' });

const query = ref('');

const { status, error, results, search } = useContentSearch();

async function onSubmit() {
  await search(query.value);
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">Search</h1>
    <p class="page-hint">
      数据源为构建产物
      <code>__search.json</code>
      。试试搜索
      <code>install</code>
      、
      <code>tooltip</code>
      或中文关键词
      <code>安装</code>
      。
    </p>

    <form class="search-form" @submit.prevent="onSubmit">
      <input v-model="query" class="search-input" type="search" placeholder="Search docs…" aria-label="Search docs" />
      <button class="search-btn" type="submit">Search</button>
    </form>

    <p class="search-status">
      status:
      <code>{{ status }}</code>
      <template v-if="error">
        —
        <code>{{ error.message }}</code>
      </template>
    </p>

    <ul v-if="results.length" class="results">
      <li v-for="hit in results" :key="hit.id" class="result">
        <a :href="hit.id" class="result-title">
          <span v-for="(t, i) in hit.titles" :key="i" class="result-crumb">{{ t }} ›</span>
          {{ hit.title }}
        </a>
        <p class="result-snippet">{{ hit.content.slice(0, 120) }}</p>
        <p class="result-meta">
          <code>{{ hit.id }}</code>
          · score {{ hit.score.toFixed(2) }} · level {{ hit.level }}
        </p>
      </li>
    </ul>
    <p v-else-if="status === 'ready' && query.trim()" class="no-results">No results.</p>
  </div>
</template>

<style scoped>
.page-title {
  margin-bottom: 0.5rem;
}

.page-hint {
  color: #666;
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.page-hint code,
.search-status code,
.result-meta code {
  background: #f1f5f9;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.85rem;
}

.search-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.search-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 1rem;
}

.search-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #f8fafc;
  cursor: pointer;
}

.search-status {
  color: #666;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.results {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 1rem;
}

.result-title {
  font-weight: 600;
  color: #2563eb;
  text-decoration: none;
}

.result-crumb {
  color: #94a3b8;
  font-weight: 400;
  font-size: 0.85rem;
}

.result-snippet {
  margin: 0.25rem 0;
  color: #475569;
  font-size: 0.9rem;
  line-height: 1.5;
}

.result-meta {
  margin: 0;
  color: #94a3b8;
  font-size: 0.8rem;
}

.no-results {
  color: #666;
}
</style>
