# Islands Architecture

ubean supports partial hydration via islands architecture. Islands are interactive components hydrated on the client, while the rest of the page stays as static HTML.

## Creating Islands

Use `client:*` directives to mark components for client-side hydration:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import Counter from '~/components/Counter.vue';

const count = ref(0);
</script>

<template>
  <Counter client:load :initial="0" />
</template>
```

The directive goes on the **component element**, not a plain `<div>`:

```vue
<template>
  <!-- Correct: directive on component -->
  <Counter client:load />

  <!-- Wrong: directive on plain element has no effect -->
  <div client:load>...</div>
</template>
```

## Hydration Strategies

### `client:load`

Hydrate immediately when the page loads (best for above-the-fold interactive elements):

```vue
<Counter client:load />
```

### `client:idle`

Hydrate when the browser is idle via `requestIdleCallback`:

```vue
<HeavyChart client:idle />
```

### `client:visible`

Hydrate when the element scrolls into view (via `IntersectionObserver`):

```vue
<Comments client:visible />
```

### `client:media`

Hydrate when a CSS media query matches:

```vue
<MobileNav client:media="(max-width: 768px)" />
```

### `client:only`

Render only on the client (no SSR output for this component):

```vue
<ClientOnlyWidget client:only />
```

## Island Components

Create reusable island components:

```vue
<!-- src/components/Counter.client.vue -->
<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  initial?: number;
}>();

const count = ref(0);
</script>

<template>
  <div>
    <button @click="count++">+</button>
    <span>{{ count }}</span>
    <button @click="count--">-</button>
  </div>
</template>
```

Use in pages with a `client:*` directive:

```vue
<template>
  <Counter client:load :initial="10" />
</template>
```

## Props

Props passed to islands must be JSON-serializable (strings, numbers, booleans, arrays, plain objects):

```vue
<template>
  <UserProfile client:visible :user-id="123" :theme="'dark'" />
</template>
```

## Events

Islands can emit events to the parent:

```vue
<!-- Island component -->
<script setup lang="ts">
const emit = defineEmits<{
  update: [value: number];
}>();

const count = ref(0);

function handleUpdate() {
  emit('update', count.value);
}
</script>
```

```vue
<!-- Parent page -->
<template>
  <Counter client:load @update="handleUpdate" />
</template>

<script setup lang="ts">
function handleUpdate(value: number) {
  console.log('Updated:', value);
}
</script>
```

## Bootstrap & Hydration

ubean transforms `client:*` directives into `<ubean-island>` custom elements at build time, with data attributes carrying component info and serialized props. A bootstrap IIFE sets `data-hydrating` based on the strategy.

On the client, `hydrateIslands()` (called automatically in `app.ts` via `onClientReady`) uses a `MutationObserver` to detect and hydrate islands. Components are registered via `compilerOptions.isCustomElement` in the Vue compiler config.

```typescript
// app.ts
import { defineApp, hydrateIslands } from 'ubean/runtime/vue';
import islandComponents from '~/islands';

export default defineApp({
  onClientReady: app => {
    hydrateIslands({ components: islandComponents, appContext: app });
  }
});
```

## Performance Tips

1. **Limit islands**: Only hydrate what's truly interactive
2. **Use `client:visible`**: Defer below-the-fold content
3. **Use `client:idle`**: Defer non-critical islands
4. **Keep islands small**: Break large components into smaller islands
5. **Reserve space**: Avoid layout shifts by reserving space for hydrated content
6. **Static pages with no islands**: Pages without any `client:*` directive ship zero client JS

## Best Practices

1. **Identify interactive parts**: Only mark truly interactive components as islands
2. **Choose the right strategy**: Match directive to user interaction patterns
3. **Test hydration**: Verify islands hydrate correctly without console errors
4. **Monitor performance**: Use DevTools to check hydration timing
5. **Avoid SSR-only code in islands**: Islands run on both server and client (except `client:only`)
