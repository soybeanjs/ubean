<script setup lang="ts">
definePageMeta({
  title: 'Home'
});
</script>

<template>
  <div class="home">
    <h1>Welcome to ubean</h1>
    <p>This is a basic pages example with navigation and layouts.</p>

    <div class="features">
      <h2>Features</h2>
      <ul>
        <li>File-based routing</li>
        <li>Layout components</li>
        <li>Server-side rendering</li>
        <li>Hot module replacement</li>
      </ul>
    </div>
  </div>
</template>

<style>
.home h1 {
  color: #42b883;
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.home p {
  color: #666;
  font-size: 1.1rem;
  line-height: 1.6;
}

.features {
  margin-top: 2rem;
}

.features h2 {
  color: #333;
  font-size: 1.5rem;
  margin-bottom: 1rem;
}

.features ul {
  list-style: none;
  padding: 0;
}

.features li {
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  color: #555;
}
</style>
