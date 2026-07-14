<script setup lang="ts">
import { useI18n, useSwitchLocalePath, useLocalePath } from 'ubean/runtime/vue';

definePage({
  head: {
    title: 'i18n Test - ubean',
    meta: [{ name: 'description', content: 'Internationalization test page' }]
  }
});

const { locale, availableLocales, t, setLocale, getLocaleDir, getLocaleName, localeDir, localeName, fallbackLocale } =
  useI18n();
const switchPath = useSwitchLocalePath();
const localePath = useLocalePath();

function switchTo(loc: string) {
  setLocale(loc);
}

const testDate = new Date();
const testNumber = 1234567.89;
const testItems = ['apple', 'banana', 'cherry'];
</script>

<template>
  <div class="p-8 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-2">{{ t('app.title') }}</h1>
    <p class="text-gray-500 mb-6">{{ t('app.description') }}</p>

    <!-- Locale Info -->
    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">Locale Info</h2>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div>Current Locale:</div>
        <div class="font-mono">{{ locale }}</div>
        <div>Fallback Locale:</div>
        <div class="font-mono">{{ fallbackLocale }}</div>
        <div>Available Locales:</div>
        <div class="font-mono">{{ availableLocales.join(', ') }}</div>
        <div>Direction:</div>
        <div class="font-mono">{{ getLocaleDir() }}</div>
        <div>Locale Name:</div>
        <div class="font-mono">{{ getLocaleName() || 'N/A' }}</div>
        <div>Reactive Dir:</div>
        <div class="font-mono">{{ localeDir }}</div>
        <div>Reactive Name:</div>
        <div class="font-mono">{{ localeName || 'N/A' }}</div>
      </div>
    </section>

    <!-- Locale Switcher -->
    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">Locale Switcher</h2>
      <div class="flex gap-3">
        <button
          v-for="loc in availableLocales"
          :key="loc"
          class="px-4 py-2 rounded-lg border transition-colors"
          :class="[
            locale === loc
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          ]"
          @click="switchTo(loc)"
        >
          {{ loc }}
        </button>
      </div>
      <p class="mt-3 text-sm text-gray-500">
        Switch path to zh:
        <code class="bg-gray-100 px-2 py-0.5 rounded">{{ switchPath('zh') }}</code>
      </p>
      <p class="mt-1 text-sm text-gray-500">
        Locale path for /about:
        <code class="bg-gray-100 px-2 py-0.5 rounded">{{ localePath('/about') }}</code>
      </p>
    </section>

    <!-- Translations -->
    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">Translations (t)</h2>
      <div class="space-y-2 text-sm">
        <div>
          <span class="text-gray-500">common.hello:</span>
          {{ t('common.hello', { name: 'ubean' }) }}
        </div>
        <div>
          <span class="text-gray-500">common.welcome:</span>
          {{ t('common.welcome') }}
        </div>
        <div>
          <span class="text-gray-500">common.goodbye:</span>
          {{ t('common.goodbye') }}
        </div>
        <div>
          <span class="text-gray-500">navigation.home:</span>
          {{ t('navigation.home') }}
        </div>
        <div>
          <span class="text-gray-500">messages.loading:</span>
          {{ t('messages.loading') }}
        </div>
        <div>
          <span class="text-gray-500">messages.success:</span>
          {{ t('messages.success') }}
        </div>
      </div>
    </section>

    <!-- Interpolation -->
    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">Interpolation</h2>
      <div class="text-sm">
        {{ t('common.hello', { name: 'Developer' }) }}
      </div>
    </section>

    <!-- Pluralization -->
    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">Pluralization</h2>
      <div class="space-y-1 text-sm">
        <div>count=0: {{ t('items.count', { count: 0 }) }}</div>
        <div>count=1: {{ t('items.count', { count: 1 }) }}</div>
        <div>count=5: {{ t('items.count', { count: 5 }) }}</div>
        <div class="mt-2 text-gray-500">Explicit:</div>
        <div>explicit 0: {{ t('items.explicit', { count: 0 }) }}</div>
        <div>explicit 1: {{ t('items.explicit', { count: 1 }) }}</div>
        <div>explicit 5: {{ t('items.explicit', { count: 5 }) }}</div>
        <div class="mt-2 text-gray-500">Categorized:</div>
        <div>cat 0: {{ t('items.categorized', { count: 0 }) }}</div>
        <div>cat 1: {{ t('items.categorized', { count: 1 }) }}</div>
        <div>cat 5: {{ t('items.categorized', { count: 5 }) }}</div>
      </div>
    </section>

    <!-- Linked Messages -->
    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">Linked Messages</h2>
      <div class="space-y-1 text-sm">
        <div>linked.greeting: {{ t('linked.greeting') }}</div>
        <div>linked.nested: {{ t('linked.nested') }}</div>
      </div>
    </section>

    <!-- Intl Formatting -->
    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">Intl Formatting</h2>
      <div class="space-y-3 text-sm">
        <div>
          <div class="text-gray-500 mb-1">Date ({{ locale }}):</div>
          <div>{{ testDate.toLocaleDateString(locale) }}</div>
        </div>
        <div>
          <div class="text-gray-500 mb-1">Number:</div>
          <div>{{ testNumber.toLocaleString(locale) }}</div>
        </div>
        <div>
          <div class="text-gray-500 mb-1">Currency (USD):</div>
          <div>{{ testNumber.toLocaleString(locale, { style: 'currency', currency: 'USD' }) }}</div>
        </div>
        <div>
          <div class="text-gray-500 mb-1">List:</div>
          <div>{{ new Intl.ListFormat(locale).format(testItems) }}</div>
        </div>
      </div>
    </section>

    <!-- Navigation -->
    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">Navigation</h2>
      <div class="flex gap-3 text-sm">
        <a href="/" class="text-blue-500 hover:underline">{{ t('navigation.home') }}</a>
        <a href="/about" class="text-blue-500 hover:underline">{{ t('navigation.about') }}</a>
        <a href="/features" class="text-blue-500 hover:underline">{{ t('navigation.features') }}</a>
        <a href="/dashboard" class="text-blue-500 hover:underline">{{ t('navigation.dashboard') }}</a>
      </div>
    </section>
  </div>
</template>
