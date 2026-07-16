<script setup lang="ts">
import { useSeoMeta, useHead } from 'ubean/runtime/vue';

definePage({
  head: {
    title: 'SEO Meta Test - ubean'
  }
});

// Test useSeoMeta with comprehensive SEO metadata
useSeoMeta({
  title: 'SEO Test Page - Ubean Framework',
  description: 'A comprehensive SEO metadata test page for ubean framework integration testing',
  robots: 'index, follow',
  ogTitle: 'SEO Test Page - Ubean Framework',
  ogDescription: 'Testing OpenGraph metadata in ubean',
  ogType: 'website',
  ogUrl: 'http://localhost:3000/seo-meta',
  ogImage: 'http://localhost:3000/og-image.png',
  ogSiteName: 'Ubean Test',
  twitterCard: 'summary_large_image',
  twitterTitle: 'SEO Test - Ubean',
  twitterDescription: 'Testing Twitter Card metadata',
  twitterImage: 'http://localhost:3000/twitter-image.png',
  author: 'Ubean Test Suite'
});

// Test useHead for additional tags
useHead({
  link: [
    { rel: 'canonical', href: 'http://localhost:3000/seo-meta' },
    { rel: 'alternate', hreflang: 'en', href: 'http://localhost:3000/seo-meta' },
    { rel: 'alternate', hreflang: 'zh', href: 'http://localhost:3000/zh/seo-meta' }
  ],
  meta: [
    { name: 'theme-color', content: '#3b82f6' },
    { name: 'application-name', content: 'Ubean Test' },
    { name: 'generator', content: 'Ubean Framework' },
    { name: 'keywords', content: 'ubean, seo, meta, opengraph, twitter, integration test' }
  ]
});
</script>

<template>
  <div class="p-8 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-2">SEO Meta Test</h1>
    <p class="text-gray-500 mb-6">This page tests useSeoMeta and useHead for SEO metadata</p>

    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">useSeoMeta Features Tested</h2>
      <ul class="space-y-1 text-sm">
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          title / description / keywords
        </li>
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          robots (index, follow)
        </li>
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          OpenGraph (og:title, og:description, og:type, og:url, og:image, og:site_name)
        </li>
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          Twitter Cards (twitter:card, twitter:title, twitter:description, twitter:image)
        </li>
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          author
        </li>
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          canonical URL
        </li>
      </ul>
    </section>

    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">useHead Features Tested</h2>
      <ul class="space-y-1 text-sm">
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          canonical link tag
        </li>
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          alternate hreflang tags (en, zh)
        </li>
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          theme-color meta
        </li>
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          application-name meta
        </li>
        <li class="flex items-center gap-2">
          <span class="text-green-500">✓</span>
          generator meta
        </li>
      </ul>
    </section>

    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">Verification</h2>
      <p class="text-sm text-gray-600 mb-2">Check the page source or browser DevTools to verify:</p>
      <ol class="list-decimal list-inside space-y-1 text-sm">
        <li>&lt;title&gt; tag contains "SEO Test Page - Ubean Framework"</li>
        <li>&lt;meta name="description"&gt; contains the description text</li>
        <li>&lt;meta name="robots"&gt; contains "index, follow"</li>
        <li>og:* meta tags are present in &lt;head&gt;</li>
        <li>twitter:* meta tags are present in &lt;head&gt;</li>
        <li>&lt;link rel="canonical"&gt; is present</li>
        <li>&lt;link rel="alternate" hreflang="..."&gt; tags are present</li>
      </ol>
    </section>

    <section class="mb-8 p-4 border rounded-lg">
      <h2 class="text-xl font-semibold mb-3">Manifest Test</h2>
      <p class="text-sm text-gray-600">
        Access
        <a href="/api/manifest-test" class="text-blue-500 hover:underline">/api/manifest-test</a>
        to test Web App Manifest generation.
      </p>
    </section>
  </div>
</template>
