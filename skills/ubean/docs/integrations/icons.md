# Icons

ubean provides two icon systems that serve different purposes:

## 1. @ubean/icon (Built-in Icon System)

`@ubean/icon` is ubean's **built-in icon plugin** that provides Iconify integration at build time and runtime. It handles icon collection scanning, SVG generation, and runtime icon rendering.

### Features

- Iconify icon set support (100k+ icons from multiple collections)
- SVG and CSS rendering modes
- Vite plugin for SFC icon scanning and preloading
- Custom icon collection registration (object-shape config)
- Runtime icon loading with API fallback (`/_iconify` dev route)
- Tree-shakeable icons
- Flip/rotate transforms

### Installation & Configuration

`@ubean/icon` is a built-in module that is **disabled by default**. Enable it via `ubean.config.ts`:

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  icon: true // Enable built-in icon system with defaults
});
```

### Enable with Custom Options

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  icon: {
    mode: 'svg', // 'svg' or 'css'
    collections: ['mdi', 'fa'], // Iconify collections to preload
    aliases: {
      home: 'mdi:home',
      user: 'fa:user'
    },
    fallbackToApi: true, // Fetch from Iconify API if not locally loaded
    iconifyApiEnabled: true
  }
});
```

### Custom collections

`customCollections` accepts an **object-shape** config (not an array). Each key maps to either a directory shorthand or a full `{ dir, prefix, normalizeIconName }` object. Nested subdirs are flattened into hyphenated prefixes.

```typescript
import { defineConfig } from 'ubean';

export default defineConfig({
  icon: {
    customCollections: {
      brand: './src/icons/brand',           // shorthand
      ui: {
        dir: './src/icons/ui',
        prefix: 'ui',
        normalizeIconName: (name: string) => name.toLowerCase()
      }
    }
  }
});
```

### Basic Usage (UbeanIcon / Icon component)

```vue
<script setup lang="ts">
import { Icon } from '@ubean/icon';
// or: import { UbeanIcon } from '@ubean/icon';
</script>

<template>
  <!-- Basic usage -->
  <Icon name="mdi:home" />

  <!-- With size and color -->
  <Icon name="mdi:user" :size="24" color="#42b883" />

  <!-- CSS mode -->
  <Icon name="mdi:settings" mode="css" />

  <!-- Flip and rotate -->
  <Icon name="mdi:arrow-right" flip="horizontal" />
  <Icon name="mdi:refresh" rotate="90" />
</template>
```

### Icon Props (UbeanIcon)

| Prop      | Type                                 | Default   | Description                           |
| --------- | ------------------------------------ | --------- | ------------------------------------- |
| name      | string                               | required  | Icon name in `collection:icon` format |
| size      | number \| string                     | '1em'     | Icon size (px number or CSS value)    |
| color     | string                               | undefined | Icon color (CSS color)                |
| className | string                               | ''        | Additional CSS class                  |
| ariaLabel | string                               | undefined | ARIA label for accessibility          |
| title     | string                               | undefined | Hover title                           |
| mode      | 'svg' \| 'css'                       | 'svg'     | Rendering mode                        |
| flip      | 'horizontal' \| 'vertical' \| 'both' | undefined | Flip direction                       |
| rotate    | number \| string                     | undefined | Rotation degrees                      |
| inline    | boolean                              | false     | Inline display alignment              |

### Register Custom Icon Collections at Runtime

```typescript
import { defineIconCollection, defineIconCollectionLoader } from '@ubean/icon';

// Static collection
defineIconCollection({
  prefix: 'custom',
  icons: {
    logo: {
      body: '<path d="M12 2L2 7l10 5 10-5-10-5z" />',
      width: 24,
      height: 24
    }
  }
});

// Lazy-loaded collection
defineIconCollectionLoader('my-icons', async () => {
  return (await import('/icons/my-icons.json')).default;
});
```

### Programmatic API

```typescript
import { useIcon, getIconSync, getIcon, addIconCollection } from '@ubean/icon';

// useIcon composable
const icon = useIcon('mdi:home');
const svg = await icon.getSvg();
const svgSync = icon.getSvgSync();

// Direct functions
const iconData = getIconSync('mdi:home');
const iconDataAsync = await getIcon('mdi:home');
```

### Local SVG serving (dev)

When `fallbackToApi` is disabled, the `/_iconify` dev route serves local SVGs before falling back to the Iconify API. `parseSvgToIconData()` extracts `body` + `width`/`height`/`viewBox` from raw SVG files.

---

## 2. @soybeanjs/ui SIcon Component

`SIcon` is a **UI component from @soybeanjs/ui** that provides a styled icon component integrated with SoybeanUI's design system, theming, and styling conventions.

### Features

- Integrated with @soybeanjs/ui theme system (light/dark mode, theme colors)
- Consistent sizing with UI components (xs/sm/md/lg/xl presets)
- Styled with shadcn-ui design system conventions
- Works with SConfigProvider for global size/theme configuration
- Supports all Iconify icons

### When to Use SIcon

Use `SIcon` when:

- You are building UI with @soybeanjs/ui components
- You need consistent theming with your application's design system
- You want preset sizes that match SoybeanUI components
- You're using SButton, SCard, etc. and need matching icon styles

### Installation

```bash
pnpm add @soybeanjs/ui
```

### Configuration (with unplugin-vue-components)

```typescript
// vite.config.ts
import Components from 'unplugin-vue-components/vite';
import { UiResolver } from '@soybeanjs/ui/resolver';

export default defineConfig({
  plugins: [
    Components({
      resolvers: [UiResolver()]
    })
  ]
});
```

### Theme Configuration

```vue
<script setup lang="ts">
import { SConfigProvider } from '@soybeanjs/ui';
</script>

<template>
  <SConfigProvider
    theme="light"
    :theme-config="{
      colors: { primary: '#42b883' },
      size: 'default'
    }"
  >
    <App />
  </SConfigProvider>
</template>
```

### Basic Usage (SIcon)

```vue
<script setup lang="ts">
import { SIcon } from '@soybeanjs/ui';
</script>

<template>
  <!-- Basic usage -->
  <SIcon icon="mdi:home" />

  <!-- With preset sizes -->
  <SIcon icon="mdi:user" size="sm" />
  <SIcon icon="mdi:settings" size="lg" />

  <!-- With custom size -->
  <SIcon icon="mdi:bell" :size="24" />

  <!-- With theme colors -->
  <SIcon icon="mdi:check" color="success" />
  <SIcon icon="mdi:alert" color="error" />
  <SIcon icon="mdi:info" color="primary" />

  <!-- In buttons -->
  <SButton>
    <SIcon icon="mdi:plus" class="mr-2" />
    Add Item
  </SButton>
</template>
```

### SIcon Props

| Prop  | Type                                           | Default   | Description                                   |
| ----- | ---------------------------------------------- | --------- | --------------------------------------------- |
| icon  | string                                         | required  | Icon name (Iconify format: `collection:icon`) |
| size  | 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| number | 'md'      | Icon size (preset or px)                      |
| color | string                                         | undefined | Theme color token or CSS color                |
| spin  | boolean                                        | false     | Spinning animation                            |
| class | string                                         | ''        | Additional CSS class                          |

---

## Key Differences

| Feature            | @ubean/icon (UbeanIcon)                           | @soybeanjs/ui (SIcon)                  |
| ------------------ | ------------------------------------------------- | -------------------------------------- |
| Component name      | `<Icon>` / `<UbeanIcon>`                          | `<SIcon>`                              |
| Icon prop          | `name` (e.g. `name="mdi:home"`)                   | `icon` (e.g. `icon="mdi:home"`)        |
| Purpose            | Build-time + runtime icon engine                  | UI-styled icon component               |
| Dependencies       | None (built-in module, opt-in via `icon: true`)   | Requires @soybeanjs/ui                 |
| Theming            | Raw CSS color support                             | Integrated with SoybeanUI theme tokens |
| Size format        | CSS values/px numbers                             | xs/sm/md/lg/xl presets + numbers       |
| Rendering modes    | SVG and CSS modes                                 | SVG only (styled)                      |
| Transforms         | Built-in flip/rotate props                        | CSS transforms via class/style         |
| API access         | Full programmatic API (useIcon, getIcon, etc.)    | Component-only                         |
| Tree-shaking       | Vite SFC scanning + preloading                    | Depends on unplugin-vue-components     |
| Custom collections | defineIconCollection / defineIconCollectionLoader | Depends on @ubean/icon runtime         |

## Recommendation

- **Use UbeanIcon** for general icon needs, custom icon collections, server-side icon generation, or when not using @soybeanjs/ui
- **Use SIcon** when building UI with @soybeanjs/ui components for consistent theming and styling across your application
- Both systems use the same Iconify icon naming (`collection:icon` format)
- You can use both in the same project if needed: UbeanIcon for infrastructure/non-UI icons, SIcon for UI components

## Icon Collections

### Popular Iconify Collections

| Collection            | Prefix         | Example                                         |
| --------------------- | -------------- | ----------------------------------------------- |
| Material Design Icons | `mdi`          | `mdi:home`, `mdi:menu`, `mdi:settings`          |
| Font Awesome          | `fa`           | `fa:user`, `fa:home`, `fa:github`               |
| Simple Icons          | `simple-icons` | `simple-icons:vuejs`, `simple-icons:react`      |
| Tabler Icons          | `tabler`       | `tabler:home`, `tabler:user`, `tabler:settings` |
| Lucide Icons          | `lucide`       | `lucide:home`, `lucide:search`, `lucide:menu`   |
| Carbon Icons          | `carbon`       | `carbon:home`, `carbon:user-avatar`             |
| Bootstrap Icons       | `bi`           | `bi:house`, `bi:person`                         |
| Heroicons             | `heroicons`    | `heroicons:home`, `heroicons:user`              |

## Best Practices

1. **Choose one primary system**: Prefer SIcon for UI, UbeanIcon for framework features
2. **Use consistent size**: Align icon sizes with your design system
3. **Accessibility**: Always provide ariaLabel for meaningful icons
4. **Preload critical icons**: Configure collections in ubean.config.ts for frequently used sets
5. **Custom SVGs**: Use custom collections for brand-specific icons
6. **Performance**: Leverage tree-shaking and avoid loading unnecessary collections
