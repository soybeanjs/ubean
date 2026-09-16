<script setup lang="ts">
import BrowserClock from '../components/sc/BrowserClock.client.vue';
import ServerGreeting from '../components/sc/ServerGreeting.server.vue';

definePage({
  name: 'ServerComponents',
  meta: { title: 'Server / Client Components' }
});
</script>

<template>
  <section class="server-components">
    <h1>Server / Client Components</h1>
    <ServerGreeting />
    <BrowserClock />
  </section>
</template>
