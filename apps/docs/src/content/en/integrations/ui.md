---
title: Ui
description: UI components from @soybeanjs/ui, integrated via @ubean/ui.
---

# UI Components (@soybeanjs/ui)

`@ubean/ui` is ubean's **built-in UI module** that integrates [`@soybeanjs/ui`](https://www.npmjs.com/package/@soybeanjs/ui) — a shadcn-style Vue component library. The module is a thin orchestration layer that wires `@soybeanjs/ui`'s component resolver and (optionally) prebuilt styles into ubean's Vite pipeline. The component library itself is consumed directly from `@soybeanjs/ui`.

## Features

- One-line enable: `ui: true` in `ubean.config.ts`
- `UiResolver` auto-registration — `S*` components (`SButton`, `SInput`, `SConfigProvider`, ...) are auto-imported on first use, no manual `import` needed
- Two styling modes:
  - **Prebuilt CSS** (default): `@soybeanjs/ui/styles.css` is auto-injected into the client entry — zero CSS setup
  - **UnoCSS mode** (`css: false`): use `@soybeanjs/unocss-shadcn` preset for utility-first styling and theming
- Type-safe configuration via `UiOptions`
- dev `optimizeDeps` pre-bundling for fast first load

## Installation

`@ubean/ui` is a built-in module. Install it as a dependency in your project:

```bash
pnpm add @ubean/ui @soybeanjs/ui
```

> `@soybeanjs/ui` is a peer dependency — you control its version. `@ubean/ui` requires `@soybeanjs/ui@>=0.29.0`.

### UnoCSS mode (optional)

If you choose `css: false` (UnoCSS mode), also install the preset:

```bash
pnpm add -D @soybeanjs/unocss-shadcn
```

## Configuration

### Minimal Setup (Prebuilt CSS)

The simplest configuration uses default settings — `UiResolver` + `styles.css`:

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  ui: true
});
```

This gives you:
- Auto-imported `S*` components everywhere (no imports needed)
- Prebuilt `@soybeanjs/ui/styles.css` injected into the client bundle

### UnoCSS Mode

For utility-first styling and full theming control, disable CSS auto-injection and use the UnoCSS preset:

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  ui: { css: false }
});
```

Then configure UnoCSS with the shadcn preset:

```typescript
// uno.config.ts
import { defineConfig, presetUno } from 'unocss';
import { presetShadcn } from '@soybeanjs/unocss-shadcn';

export default defineConfig({
  presets: [
    presetUno(),
    presetShadcn({
      // Customize theme color tokens here (CSS variables driven)
      // color: { primary: 'hsl(var(--primary))' }
    })
  ],
  // Recommended: enable reset + global + ui generated styles
  // (see @soybeanjs/unocss-shadcn docs for full options)
});
```

### Disabling

To disable the module explicitly (same as omitting it):

```typescript
export default defineConfig({
  ui: false
});

// or
export default defineConfig({
  ui: { disabled: true }
});
```

## Usage

### Auto-imported Components

With `ui: true`, all `S*` components from `@soybeanjs/ui` are auto-imported — just use them in templates:

```vue
<template>
  <SConfigProvider>
    <SButton variant="default">Click me</SButton>
    <SInput v-model="value" placeholder="Type..." />
  </SConfigProvider>
</template>

<script setup lang="ts">
const value = ref('');
</script>
```

No `import { SButton } from '@soybeanjs/ui'` needed — `UiResolver` resolves `S*` names to `@soybeanjs/ui` exports at compile time and registers them in `components.d.ts`.

### Explicit Import (when needed)

For programmatic usage or when you want explicit imports:

```typescript
import { SButton, useToast } from '@soybeanjs/ui';
```

### Available Components

`@soybeanjs/ui` ships a growing list of shadcn-style components. Common ones:

- **Form**: `SInput`, `STextarea`, `SSelect`, `SCheckbox`, `SRadioGroup`, `SSwitch`, `SSlider`, `SDatePicker`
- **Layout**: `SCard`, `SSeparator`, `STabs`, `SAccordion`, `SResizable`
- **Feedback**: `SAlert`, `SToast`, `SDialog`, `SSheet`, `SPopover`, `STooltip`, `SSkeleton`
- **Navigation**: `SNavigationMenu`, `SCommand`, `SBreadcrumb`, `SPagination`
- **Data**: `STable`, `SDataTable`, `STree`
- **Misc**: `SButton`, `SBadge`, `SAvatar`, `SDropdownMenu`, `SContextMenu`

See the [`@soybeanjs/ui` docs](https://www.npmjs.com/package/@soybeanjs/ui) for the full list and props.

## How It Works

`@ubean/ui` is a thin wrapper. When `ui: true` is set:

1. **Module system loads** `@ubean/ui/vite` and calls `ubeanUiPlugin(options)` (where `options` comes from `extractBuiltinOptions(config.ui)` — `{ css: false }` when configured as an object, `{}` when `true`).

2. **`ubeanUiPlugin` registers** `UiResolver()` (from `@soybeanjs/ui/resolver`) into ubean's module extension registry (`@ubean/build/registry`).

3. **`ubeanVite` reads** the registry when constructing `unplugin-vue-components` and merges all registered resolvers into the `resolvers` array. This makes `S*` components resolvable from any `.vue` / `.md` file.

4. **CSS injection** (when `css !== false`): `ubeanUiPlugin` calls `registerCssImport('@soybeanjs/ui/styles.css')`. The `virtual:ubean-client-entry` virtual module prepends `import '@soybeanjs/ui/styles.css';` to the client entry, so the prebuilt stylesheet ships with the client bundle automatically.

5. **dev `optimizeDeps`**: `ubeanUiPlugin` adds `@soybeanjs/ui` to Vite's `optimizeDeps.include`, ensuring the component library is pre-bundled for fast first page load in dev.

> The registry pattern keeps `@ubean/vite` decoupled from any specific component library — future built-in UI integrations can reuse the same mechanism.

## Programmatic API

```typescript
import { ubeanUiPlugin, defineUiConfig } from '@ubean/ui/vite';
import type { UiOptions } from '@ubean/ui';
```

### `ubeanUiPlugin(options?: UiOptions): Plugin[]`

Returns an array of Vite plugins. Usually called automatically by the module system; call manually only when integrating outside `ubean.config.ts`.

### `defineUiConfig(options: UiOptions): UiOptions`

Type-safe helper for authoring `UiOptions` with autocompletion. Transparently returns the input.

### `UiOptions`

```typescript
export interface UiOptions {
  /** Whether the module is enabled (default: true) */
  enabled?: boolean;
  /**
   * Whether to auto-inject `@soybeanjs/ui/styles.css` (default: true).
   *
   * - `true` (default): prebuilt CSS auto-injected, zero CSS setup
   * - `false`: UnoCSS mode — configure `@soybeanjs/unocss-shadcn` yourself
   */
  css?: boolean;
}
```

> When configured via `ubean.config.ts`, the framework reads `ui: true | UiModuleConfig` (where `UiModuleConfig` adds an optional `disabled` field). The module system strips `disabled` before passing options to `ubeanUiPlugin`, so `enabled` and `disabled` are equivalent negations — use whichever reads more naturally in your config.

## Theming

### Prebuilt CSS Mode

The prebuilt `styles.css` ships with default shadcn-inspired styles driven by CSS variables. To customize the theme, override the CSS variables in your global stylesheet:

```css
/* src/assets/main.css */
:root {
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  /* ... other tokens */
}

.dark {
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
}
```

Refer to `@soybeanjs/ui`'s theme tokens for the full variable list.

### UnoCSS Mode

With `css: false`, theming is handled by `@soybeanjs/unocss-shadcn` preset. The preset generates utility classes for all shadcn components and respects the same CSS variables. Configure theme tokens in `uno.config.ts`:

```typescript
// uno.config.ts
import { defineConfig, presetUno } from 'unocss';
import { presetShadcn } from '@soybeanjs/unocss-shadcn';

export default defineConfig({
  presets: [presetUno(), presetShadcn()],
  theme: {
    colors: {
      primary: 'hsl(var(--primary))',
      // ... map to your CSS variables
    }
  }
});
```

## SSR Considerations

`@soybeanjs/ui` is SSR-safe — components render correctly during ubean's SSR pass. The prebuilt `styles.css` is injected into the client entry only (not the SSR bundle), so server-rendered HTML uses inline styles or class-based styling that the client hydrates with the full stylesheet.

For UnoCSS mode, ensure `@soybeanjs/unocss-shadcn`'s generated styles are included in both client and SSR builds (UnoCSS's Vite plugin handles this automatically).

## Best Practices

1. **Start with prebuilt CSS**: Use `ui: true` (default) for fastest setup. Switch to UnoCSS mode only when you need utility-first theming or want to reduce CSS bundle size via tree-shaking.

2. **Wrap your app in `SConfigProvider`**: It provides theme, locale, and other context to all `S*` components. Put it in your root layout:

   ```vue
   <!-- src/layouts/default.vue -->
   <template>
     <SConfigProvider>
       <slot />
     </SConfigProvider>
   </template>
   ```

3. **Don't mix styling modes**: Pick one (prebuilt CSS or UnoCSS) and stick with it across the project. Mixing leads to duplicate style declarations and inconsistent theming.

4. **Customize via CSS variables, not overrides**: Both modes respect shadcn's CSS variable system. Override variables in `:root` / `.dark` instead of writing component-scoped CSS — this keeps your styles portable across component library upgrades.

5. **Use the Icon component from `@soybeanjs/ui`**: `SIcon` (or `<Icon />` from `@soybeanjs/ui`) supports any Iconify icon. If you also have `@ubean/icon` enabled, both can coexist — `@ubean/icon` handles local SVG collections, while `@soybeanjs/ui`'s Icon handles the full Iconify catalog via `@iconify/vue`.

6. **Keep `@soybeanjs/ui` version aligned**: Pin `@soybeanjs/ui` to a known-good version in your `package.json`. The library is under active development — breaking changes may occur between minor versions before 1.0.

## Troubleshooting

### Components not auto-imported

- Verify `ui: true` (or `ui: { css: ... }`) is set in `ubean.config.ts`
- Run `ubean prepare` to regenerate `.ubean/components.d.ts`
- Check that `@ubean/ui` and `@soybeanjs/ui` are installed (not just one of them)
- Ensure the component name starts with `S` (e.g. `SButton`, not `Button`)

### Styles missing in prebuilt CSS mode

- Verify `css` is not set to `false` (default is `true`)
- Check the client entry virtual module output: run `ubean dev` and inspect the loaded modules in Vite — `@soybeanjs/ui/styles.css` should appear
- If using a custom Vite config, ensure `ubeanUiPlugin`'s output isn't being filtered out

### UnoCSS classes not generated

- Verify `@soybeanjs/unocss-shadcn` is installed and added to `uno.config.ts` presets
- Enable the preset's `generated: { reset: true, global: true, ui: true }` option if available
- Check `uno.config.ts` `content` / `include` patterns cover your `.vue` files

### Type errors for `S*` components

- Run `ubean prepare` to regenerate type declarations
- Verify `tsconfig.json` includes `.ubean/components.d.ts`
- If using explicit imports, ensure you import from `@soybeanjs/ui` (not `@ubean/ui`)

## Examples

### Form with Validation

```vue
<!-- src/pages/contact.vue -->
<script setup lang="ts">
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2, 'Name too short'),
  email: z.string().email('Invalid email')
});

const form = reactive({ name: '', email: '' });
const errors = ref<Record<string, string>>({});

function submit() {
  const result = schema.safeParse(form);
  if (!result.success) {
    errors.value = Object.fromEntries(
      result.error.issues.map(i => [i.path[0] as string, i.message])
    );
    return;
  }
  // submit...
}
</script>

<template>
  <form @submit.prevent="submit" class="flex flex-col gap-4 max-w-sm">
    <div>
      <SInput v-model="form.name" placeholder="Name" />
      <p v-if="errors.name" class="text-red-500 text-sm">{{ errors.name }}</p>
    </div>
    <div>
      <SInput v-model="form.email" type="email" placeholder="Email" />
      <p v-if="errors.email" class="text-red-500 text-sm">{{ errors.email }}</p>
    </div>
    <SButton type="submit">Submit</SButton>
  </form>
</template>
```

### Dialog with Trigger

```vue
<!-- src/components/UserDeleteDialog.vue -->
<script setup lang="ts">
const props = defineProps<{ userId: string }>();
const open = ref(false);

async function confirmDelete() {
  await fetch(`/api/users/${props.userId}`, { method: 'DELETE' });
  open.value = false;
}
</script>

<template>
  <SDialog v-model:open="open">
    <SDialogTrigger as-child>
      <SButton variant="destructive">Delete</SButton>
    </SDialogTrigger>
    <SDialogContent>
      <SDialogHeader>
        <SDialogTitle>Delete user?</SDialogTitle>
        <SDialogDescription>
          This action cannot be undone.
        </SDialogDescription>
      </SDialogHeader>
      <SDialogFooter>
        <SButton variant="outline" @click="open = false">Cancel</SButton>
        <SButton variant="destructive" @click="confirmDelete">Confirm</SButton>
      </SDialogFooter>
    </SDialogContent>
  </SDialog>
</template>
```

## Resources

- [`@soybeanjs/ui` on npm](https://www.npmjs.com/package/@soybeanjs/ui)
- [`@soybeanjs/unocss-shadcn` on npm](https://www.npmjs.com/package/@soybeanjs/unocss-shadcn)
- [shadcn/ui (reference design)](https://ui.shadcn.com/)
- [Iconify](https://iconify.design/) — for `SIcon` icon names
