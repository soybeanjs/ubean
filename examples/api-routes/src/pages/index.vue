<script setup lang="ts">
import { ref, onMounted } from 'vue';

definePageMeta({
  title: 'API Routes Example'
});

interface User {
  id: number;
  name: string;
  email: string;
}

const users = ref<User[]>([]);
const loading = ref(true);

onMounted(async () => {
  const res = await fetch('/api/users');
  users.value = await res.json();
  loading.value = false;
});
</script>

<template>
  <div class="container">
    <h1>API Routes Example</h1>
    <p>This example demonstrates CRUD API routes.</p>
    
    <div v-if="loading" class="loading">Loading...</div>
    
    <div v-else class="users">
      <h2>Users</h2>
      <ul>
        <li v-for="user in users" :key="user.id">
          <strong>{{ user.name }}</strong>
          <span>{{ user.email }}</span>
        </li>
      </ul>
      
      <div class="endpoints">
        <h2>Available Endpoints</h2>
        <ul>
          <li><code>GET /api/users</code> - Get all users</li>
          <li><code>GET /api/users/:id</code> - Get single user</li>
        </ul>
      </div>
    </div>
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

h2 {
  color: #333;
  font-size: 1.5rem;
  margin-top: 2rem;
  margin-bottom: 1rem;
}

p {
  color: #666;
  font-size: 1.1rem;
  line-height: 1.6;
}

.loading {
  padding: 20px;
  text-align: center;
  color: #999;
}

.users ul {
  list-style: none;
  padding: 0;
}

.users li {
  padding: 15px;
  border: 1px solid #eee;
  border-radius: 8px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.users li strong {
  color: #333;
}

.users li span {
  color: #666;
  font-size: 0.9rem;
}

.endpoints {
  margin-top: 2rem;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.endpoints code {
  background: #e9ecef;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'Fira Code', monospace;
}
</style>
