<script setup lang="ts">
import { defineSlots } from 'vue';

defineSlots<{
  default: {};
}>();
</script>

<template>
  <div class="layout">
    <header>
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </nav>
    </header>
    <main>
      <slot />
    </main>
    <footer>
      <p>© 2024 ubean</p>
    </footer>
  </div>
</template>

<style>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

header {
  background: #42b883;
  padding: 1rem;
}

nav {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  gap: 2rem;
}

nav a {
  color: white;
  text-decoration: none;
  font-weight: 500;
}

nav a:hover {
  text-decoration: underline;
}

main {
  flex: 1;
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
}

footer {
  background: #333;
  color: white;
  text-align: center;
  padding: 1rem;
}

footer p {
  margin: 0;
}
</style>
