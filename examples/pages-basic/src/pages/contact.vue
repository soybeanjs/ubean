<script setup lang="ts">
import { ref } from 'vue';
import { defineAction } from '@ubean/core';

definePageMeta({
  title: 'Contact'
});

const { pending, execute } = defineAction(async (formData: FormData) => {
  console.log('Form submitted:', Object.fromEntries(formData));
});

const name = ref('');
const email = ref('');
const message = ref('');
</script>

<template>
  <div class="contact">
    <h1>Contact</h1>
    <p>Get in touch with us.</p>

    <form class="contact-form" @submit.prevent="execute">
      <div class="form-group">
        <label for="name">Name</label>
        <input id="name" v-model="name" type="text" name="name" required placeholder="Your name" />
      </div>

      <div class="form-group">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" name="email" required placeholder="your@email.com" />
      </div>

      <div class="form-group">
        <label for="message">Message</label>
        <textarea id="message" v-model="message" name="message" required rows="5" placeholder="Your message"></textarea>
      </div>

      <button type="submit" :disabled="pending">
        {{ pending ? 'Sending...' : 'Send' }}
      </button>
    </form>
  </div>
</template>

<style>
.contact h1 {
  color: #42b883;
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.contact p {
  color: #666;
  font-size: 1.1rem;
  line-height: 1.6;
}

.contact-form {
  margin-top: 2rem;
  max-width: 500px;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #333;
  font-weight: 500;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #42b883;
}

button {
  background: #42b883;
  color: white;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.3s;
}

button:hover:not(:disabled) {
  background: #379a6b;
}

button:disabled {
  background: #a8d6be;
  cursor: not-allowed;
}
</style>
