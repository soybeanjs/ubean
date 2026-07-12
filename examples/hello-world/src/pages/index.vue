<script setup lang="ts">
definePage({
  meta: {
    title: 'Hello World'
  }
});
</script>

<template>
  <div class="container">
    <h1>Hello World</h1>
    <p>Welcome to ubean!</p>
    <p>This is a minimal hello-world example.</p>
  </div>
</template>

<style>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
  color: #42b883;
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

p {
  color: #666;
  font-size: 1.1rem;
  line-height: 1.6;
}
</style>
