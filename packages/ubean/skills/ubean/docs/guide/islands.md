# Islands Architecture

uBean supports partial hydration with islands architecture.

## Overview

Islands are interactive components that are "hydrated" on the client side, while the rest of the page remains static HTML.

## Creating Islands

Use `client:` directives to mark components for client-side hydration:

```vue
<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <div client:load>
    <button @click="count++">Increment</button>
    <p>Count: {{ count }}</p>
  </div>
</template>
```

## Hydration Strategies

### client:load

Hydrate immediately when the page loads:

```vue
<div client:load>
  <!-- Hydrated immediately -->
</div>
```

### client:idle

Hydrate when the browser is idle:

```vue
<div client:idle>
  <!-- Hydrated when idle -->
</div>
```

### client:visible

Hydrate when the element becomes visible:

```vue
<div client:visible>
  <!-- Hydrated when scrolled into view -->
</div>
```

### client:media

Hydrate when a media query matches:

```vue
<div client:media="(min-width: 768px)">
  <!-- Hydrated on desktop -->
</div>
```

### client:only

Render only on the client (no SSR):

```vue
<div client:only>
  <!-- Client-only content -->
</div>
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

Use in pages:

```vue
<script setup lang="ts">
import Counter from '@/components/Counter.client.vue';
</script>

<template>
  <Counter client:load />
</template>
```

## Data Fetching in Islands

Fetch data on the client side:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';

const data = ref(null);

onMounted(async () => {
  const res = await fetch('/api/data');
  data.value = await res.json();
});
</script>

<template>
  <div client:visible>
    <div v-if="data">{{ data.name }}</div>
  </div>
</template>
```

## Island Props

Pass props to islands:

```vue
<script setup lang="ts">
import UserProfile from '@/components/UserProfile.client.vue';
</script>

<template>
  <UserProfile 
    client:visible 
    :user-id="123" 
    :theme="'dark'" 
  />
</template>
```

## Island Events

Emit events from islands:

```vue
<!-- Island component -->
<script setup lang="ts">
const emit = defineEmits<{
  update: [value: number];
}>();

const count = ref(0);

const handleUpdate = () => {
  emit('update', count.value);
};
</script>
```

```vue
<!-- Parent page -->
<script setup lang="ts">
const handleUpdate = (value: number) => {
  console.log('Updated:', value);
};
</script>

<template>
  <Counter client:load @update="handleUpdate" />
</template>
```

## Performance Tips

1. **Limit islands**: Only hydrate what's necessary
2. **Use client:visible**: Defer hydration for below-the-fold content
3. **Use client:idle**: Defer non-critical islands
4. **Keep islands small**: Break large components into smaller islands
5. **Avoid layout shifts**: Reserve space for hydrated content

## Server-Side Islands

Some islands can render on the server and hydrate on the client:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';

// This runs on server and client
const serverValue = 'Server rendered';

// This runs only on client after hydration
const clientValue = ref(null);
onMounted(() => {
  clientValue.value = 'Client hydrated';
});
</script>

<template>
  <div client:load>
    <p>{{ serverValue }}</p>
    <p>{{ clientValue }}</p>
  </div>
</template>
```

## Best Practices

1. **Identify interactive parts**: Only mark truly interactive components as islands
2. **Choose the right strategy**: Use appropriate hydration directive
3. **Optimize images**: Use `client:visible` for lazy-loaded images
4. **Test hydration**: Verify islands hydrate correctly
5. **Monitor performance**: Use DevTools to check hydration time
