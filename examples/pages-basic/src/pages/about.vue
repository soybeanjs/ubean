<script setup lang="ts">
definePageMeta({
  title: 'About'
});
</script>

<template>
  <div class="about">
    <h1>About</h1>
    <p>ubean is a full-stack framework for building modern web applications.</p>

    <div class="about-content">
      <h2>What is ubean?</h2>
      <p>ubean combines Vite, Hono, and Vue to provide a powerful development experience.</p>

      <h2>Key Features</h2>
      <ul>
        <li>Fast development with Vite</li>
        <li>Lightweight server with Hono</li>
        <li>Progressive Vue framework</li>
        <li>Built-in internationalization</li>
        <li>Islands architecture</li>
      </ul>
    </div>
  </div>
</template>

<style>
.about h1 {
  color: #42b883;
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.about p {
  color: #666;
  font-size: 1.1rem;
  line-height: 1.6;
}

.about-content {
  margin-top: 2rem;
}

.about-content h2 {
  color: #333;
  font-size: 1.5rem;
  margin-top: 1.5rem;
  margin-bottom: 1rem;
}

.about-content ul {
  list-style: none;
  padding: 0;
}

.about-content li {
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  color: #555;
}
</style>
