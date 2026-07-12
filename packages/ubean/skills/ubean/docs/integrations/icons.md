# Icons

## Iconify Integration

### Installation

```bash
pnpm add @ubean/icon
```

### Configuration

```typescript
// ubean.config.ts
import { defineConfig } from '@ubean/core';

export default defineConfig({
  icon: true
});
```

### Basic Usage

```vue
<script setup lang="ts">
import { SIcon } from '@soybeanjs/ui';
</script>

<template>
  <SIcon name="mdi:home" />
  <SIcon name="fa:user" />
  <SIcon name="simple-icons:vuejs" />
</template>
```

### Icon Props

| Prop | Type | Description |
|------|------|-------------|
| name | string | Icon name (collection:icon) |
| size | number \| string | Icon size |
| color | string | Icon color |
| class | string | CSS class |
| style | object | Inline style |

### Example

```vue
<SIcon name="mdi:home" :size="24" color="#42b883" />
<SIcon name="fa:user" size="lg" />
<SIcon name="simple-icons:vuejs" class="icon-class" />
```

## Icon Collections

### Material Design Icons

```vue
<SIcon name="mdi:home" />
<SIcon name="mdi:menu" />
<SIcon name="mdi:settings" />
<SIcon name="mdi:bell" />
<SIcon name="mdi:search" />
```

### Font Awesome

```vue
<SIcon name="fa:user" />
<SIcon name="fa:home" />
<SIcon name="fa:github" />
<SIcon name="fa:twitter" />
<SIcon name="fa:linkedin" />
```

### Simple Icons

```vue
<SIcon name="simple-icons:vuejs" />
<SIcon name="simple-icons:react" />
<SIcon name="simple-icons:typescript" />
<SIcon name="simple-icons:javascript" />
<SIcon name="simple-icons:node-dot-js" />
```

### Tabler Icons

```vue
<SIcon name="tabler:home" />
<SIcon name="tabler:user" />
<SIcon name="tabler:settings" />
<SIcon name="tabler:mail" />
<SIcon name="tabler:phone" />
```

### Lucide Icons

```vue
<SIcon name="lucide:home" />
<SIcon name="lucide:user" />
<SIcon name="lucide:settings" />
<SIcon name="lucide:search" />
<SIcon name="lucide:menu" />
```

## Custom Icons

### SVG Icons

```vue
<script setup lang="ts">
import { SIcon } from '@soybeanjs/ui';
</script>

<template>
  <SIcon>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  </SIcon>
</template>
```

### Icon Component

```vue
<script setup lang="ts">
import { SIcon } from '@soybeanjs/ui';
</script>

<template>
  <SIcon name="custom:my-icon" />
</template>
```

## Icon Aliases

### Configuration

```typescript
// ubean.config.ts
import { defineConfig } from '@ubean/core';

export default defineConfig({
  icon: {
    aliases: {
      'home': 'mdi:home',
      'user': 'fa:user',
      'logo': 'simple-icons:vuejs'
    }
  }
});
```

### Usage

```vue
<SIcon name="home" />
<SIcon name="user" />
<SIcon name="logo" />
```

## Dynamic Icons

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { SIcon } from '@soybeanjs/ui';

const iconName = ref('mdi:home');

const icons = [
  'mdi:home',
  'mdi:menu',
  'mdi:settings'
];
</script>

<template>
  <SIcon :name="iconName" />
  
  <div v-for="icon in icons" :key="icon">
    <SIcon :name="icon" />
  </div>
</template>
```

## Icon Buttons

```vue
<script setup lang="ts">
import { SIcon } from '@soybeanjs/ui';
</script>

<template>
  <button class="icon-btn">
    <SIcon name="mdi:edit" />
  </button>
  
  <button class="icon-btn" :class="{ active: isActive }">
    <SIcon name="mdi:star" />
  </button>
</template>
```

## Performance Tips

1. **Tree shaking**: Only import used icons
2. **SVG sprites**: Use sprites for multiple icons
3. **Cache icons**: Iconify caches loaded icons
4. **Lazy loading**: Load icons on demand
5. **Preload critical icons**: Preload frequently used icons

## Best Practices

1. **Use consistent size**: Maintain consistent icon sizes
2. **Use semantic names**: Use descriptive icon names
3. **Provide fallbacks**: Have fallback for missing icons
4. **Accessibility**: Add aria-label for screen readers
5. **Color consistency**: Use consistent color scheme
