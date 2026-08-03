---
title: Pinia
description: Pinia state management through the built-in @ubean/pinia module.
---

# Pinia State Management (@ubean/pinia)

`@ubean/pinia` is ubean's **built-in state management module** that integrates [Pinia](https://pinia.vuejs.org/) — the official Vue state management library. The module is a thin orchestration layer that wires Pinia's dev optimization and SSR state hydration into ubean's Vite pipeline and SSR protocol. Pinia itself is consumed directly from the `pinia` package.

## Features

- One-line enable: `pinia: true` in `ubean.config.ts`
- Dev `optimizeDeps` pre-bundling for `pinia` — fast first page load in dev
- SSR state hydration via `defineApp({ serializeState, hydrateState })` hooks
- Zero-invasion: Pinia API (`createPinia`, `defineStore`, `storeToRefs`, ...) imported directly from `pinia`
- Type-safe configuration via `UbeanPiniaOptions`
- Safe degradation: serialization returns `{}` when `$pinia` is missing; hydration is a no-op when state is `null` or has no `pinia` field

## Installation

`@ubean/pinia` is a built-in module. Install it together with `pinia` in your project:

```bash
pnpm add @ubean/pinia pinia
```

> `pinia` is a peer dependency — you control its version. `@ubean/pinia` supports `pinia@^2.0.0 || ^3.0.0`.

## Configuration

### Minimal Setup

The simplest configuration only enables dev pre-bundling optimization:

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  pinia: true
});
```

Then register Pinia and the SSR hydration hooks in `src/app.ts`:

```typescript
// src/app.ts
import { createPinia } from 'pinia';
import { serializePiniaState, hydratePiniaState } from '@ubean/pinia/runtime';
import { defineApp } from 'ubean';

export default defineApp({
  plugins: [createPinia()],
  serializeState: serializePiniaState,
  hydrateState: hydratePiniaState
});
```

This gives you:
- `pinia` pre-bundled in dev for fast first load
- Server-side state serialized into the HTML `__UBEAN_STATE__` script tag
- Client-side hydration before `app.mount()` (so stores are populated with SSR state)

### Disabling

To disable the module explicitly (same as omitting it):

```typescript
export default defineConfig({
  pinia: false
});

// or
export default defineConfig({
  pinia: { enabled: false }
});
```

### Disabling dev optimizeDeps

If you use a custom `pinia` alias or a monorepo-local `pinia` source, disable pre-bundling:

```typescript
export default defineConfig({
  pinia: { optimizeDeps: false }
});
```

## Usage

### Defining a Store

Store definitions are identical to regular Pinia:

```typescript
// src/stores/counter.ts
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    name: 'Counter'
  }),
  getters: {
    double: state => state.count * 2,
    // with type inference
    doubleCount(): number {
      return this.count * 2;
    }
  },
  actions: {
    increment() {
      this.count++;
    },
    async fetchInitial() {
      const res = await fetch('/api/counter');
      this.count = await res.json();
    }
  }
});
```

Composition API style (setup stores) is also fully supported:

```typescript
import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', () => {
  const name = ref('');
  const isAdmin = ref(false);

  const displayName = computed(() => name.value || 'Guest');

  async function login(email: string, password: string) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    const user = await res.json();
    name.value = user.name;
    isAdmin.value = user.role === 'admin';
  }

  return { name, isAdmin, displayName, login };
});
```

### Using Stores in Components

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useCounterStore } from '~/stores/counter';

const store = useCounterStore();

// Destructure with reactivity preserved
const { count, double } = storeToRefs(store);

// Actions can be destructured directly
const { increment } = store;
</script>

<template>
  <div>
    <p>Count: {{ count }}</p>
    <p>Double: {{ double }}</p>
    <SButton @click="increment">Increment</SButton>
  </div>
</template>
```

### Using Stores in API Routes / Loaders

Within ubean's server-side handlers, you typically don't share Pinia state across requests — each SSR request creates a fresh app instance. Use Pinia stores inside `defineApp`'s `onAppCreated` or within loaders via the SSR app instance.

For page loaders, prefer the loader/action data protocol over Pinia for request-scoped data. Pinia is best suited for client-side shared state (UI state, cached data, user preferences).

## How It Works

`@ubean/pinia` is a thin wrapper. When `pinia: true` is set:

1. **Module system loads** `@ubean/pinia/vite` and calls `ubeanPiniaPlugin(options)` (where `options` comes from `extractBuiltinOptions(config.pinia)` — `{ optimizeDeps: false }` when configured as an object, `{}` when `true`).

2. **Dev optimizeDeps**: `ubeanPiniaPlugin` adds `pinia` to Vite's `optimizeDeps.include`, ensuring Pinia is pre-bundled for fast first page load in dev. This avoids the dependency scanning delay on the first request.

3. **SSR serialization**: When `serializePiniaState` is configured as `defineApp({ serializeState })`, the ubean SSR renderer calls it after `renderToString(app)` completes. The function reads `app.config.globalProperties.$pinia.state.value` and returns `{ pinia: ... }`. The renderer serializes this to JSON and injects it into the HTML as `<script id="__UBEAN_STATE__" type="application/json">`.

4. **Client hydration**: When `hydratePiniaState` is configured as `defineApp({ hydrateState })`, the ubean client entry calls it after `applyAppConfig(app, config, 'client')` (which registers `createPinia()` as a plugin) but **before** `app.mount()`. The function reads the `pinia` field from the deserialized state and assigns it to `pinia.state.value`.

> The hydration must happen before `mount` — otherwise stores are already initialized with default state and the hydration is a no-op. ubean's client entry ensures this ordering.

## SSR State Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Server                                                          │
│                                                                 │
│  createSSRApp(initialPage)                                      │
│  applyAppConfig → app.use(createPinia())                        │
│  router.push(url) → renderToString(app)                         │
│  serializeState(app) → { pinia: pinia.state.value }             │
│  HTML = shell.replace(STATE_MARKER, <script id=__UBEAN_STATE__>)│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (HTML with embedded state)
┌─────────────────────────────────────────────────────────────────┐
│ Client                                                          │
│                                                                 │
│  createApp()                                                    │
│  applyAppConfig → app.use(createPinia())                        │
│  state = getInitialState()  // read __UBEAN_STATE__             │
│  hydrateState(app, state) → pinia.state.value = state.pinia     │
│  app.mount('#app')  // stores already hydrated                  │
└─────────────────────────────────────────────────────────────────┘
```

## Programmatic API

```typescript
import { ubeanPiniaPlugin, definePiniaConfig } from '@ubean/pinia/vite';
import { serializePiniaState, hydratePiniaState } from '@ubean/pinia/runtime';
import type { UbeanPiniaOptions, PiniaSerializedState } from '@ubean/pinia';
```

### `ubeanPiniaPlugin(options?: UbeanPiniaOptions): Plugin[]`

Returns an array of Vite plugins. Usually called automatically by the module system; call manually only when integrating outside `ubean.config.ts`.

### `definePiniaConfig(options: UbeanPiniaOptions): UbeanPiniaOptions`

Type-safe helper for authoring `UbeanPiniaOptions` with autocompletion. Transparently returns the input.

### `serializePiniaState(app: VueApp): PiniaSerializedState`

SSR serialization helper. Reads `app.config.globalProperties.$pinia.state.value` and returns `{ pinia: <deep-cloned state> }`. Returns `{}` when `$pinia` is not detected (e.g., `createPinia()` not registered) — does not throw.

### `hydratePiniaState(app: VueApp, state: Record<string, unknown> | null): void`

Client hydration helper. Assigns `state.pinia` to `pinia.state.value`. No-op when `state` is `null` or has no `pinia` field. Warns to the console when `$pinia` is not detected on the app (configuration error: `hydrateState` configured but `createPinia()` not registered).

### `UbeanPiniaOptions`

```typescript
export interface UbeanPiniaOptions {
  /** Whether the module is enabled (default: true) */
  enabled?: boolean;
  /**
   * Whether to add `pinia` to Vite's `optimizeDeps.include` (default: true).
   *
   * Pre-bundling in dev avoids the dependency scanning delay on first request.
   * Disable if you use a custom `pinia` alias or monorepo-local pinia source.
   */
  optimizeDeps?: boolean;
}
```

### `PiniaSerializedState`

```typescript
export interface PiniaSerializedState {
  /** Pinia root state (pinia.state.value) */
  pinia?: Record<string, unknown>;
  /** Allows extending with custom fields */
  [key: string]: unknown;
}
```

> When configured via `ubean.config.ts`, the framework reads `pinia: true | UbeanPiniaOptions`. The module system passes the options directly to `ubeanPiniaPlugin`.

## Best Practices

1. **Always pair `pinia: true` with the app.ts hooks**: `pinia: true` only enables dev pre-bundling. SSR state hydration requires `serializePiniaState` / `hydratePiniaState` in `defineApp`. Without them, SSR-rendered stores reset to defaults on client hydration.

2. **One Pinia instance per app**: Call `createPinia()` once in `defineApp({ plugins: [createPinia()] })`. Do not create multiple Pinia instances — state hydration assumes a single `$pinia` on the app.

3. **Don't share server-side Pinia state across requests**: Each SSR request creates a fresh Vue app (and thus a fresh Pinia). Do not hoist a Pinia instance to module scope — it leaks state between requests.

4. **Use loaders for request-scoped data**: For data that varies per request (e.g., user-specific data, route params), prefer ubean's page loader/action protocol. Pinia is best for client-side shared state (UI state, cached data, user preferences) that needs to survive route changes.

5. **Hydrate before mount**: The ubean client entry ensures `hydrateState` runs before `app.mount()`. If you customize the entry, preserve this ordering — otherwise stores initialize with defaults and hydration is lost.

6. **Pinia + Islands**: Pinia state is available in the main Vue app. Islands (`v-client.load`, `v-client.idle`, etc.) are separate Vue subtrees — they don't automatically share the main app's Pinia instance. If an island needs Pinia, install it on the island's app or pass state via props.

## Troubleshooting

### Stores reset to defaults after hydration

- Verify `serializePiniaState` and `hydratePiniaState` are both configured in `defineApp`
- Check that `createPinia()` is in `defineApp({ plugins: [...] })` (not registered later via `onAppCreated`)
- Inspect the rendered HTML for `<script id="__UBEAN_STATE__" type="application/json">` — it should contain the serialized state
- Verify `hydrateState` runs before `app.mount()` (it does in the default client entry)

### Warning: "hydrateState was called but no $pinia was detected on the app"

This means `hydratePiniaState` was called but `createPinia()` was not registered as a plugin. Fix:

```typescript
// src/app.ts
import { createPinia } from 'pinia';
import { hydratePiniaState } from '@ubean/pinia/runtime';

export default defineApp({
  plugins: [createPinia()], // <-- this is required
  hydrateState: hydratePiniaState
});
```

### Pinia not pre-bundled in dev

- Verify `pinia: true` (or `pinia: { ... }`) is set in `ubean.config.ts`
- Run `ubean dev` and check Vite's optimizeDeps output — `pinia` should appear in `optimizeDeps.include`
- If using a custom Vite config, ensure `ubeanPiniaPlugin`'s output isn't being filtered out

### Type errors for `@ubean/pinia/runtime`

- Run `ubean prepare` to regenerate type declarations
- Verify `tsconfig.json` includes the `@ubean/pinia` types
- Ensure you import from `@ubean/pinia/runtime` (not `@ubean/pinia`) for the runtime helpers

## Examples

### Counter with SSR

```vue
<!-- src/pages/counter.vue -->
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useCounterStore } from '~/stores/counter';

const store = useCounterStore();
const { count, double } = storeToRefs(store);
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <h1>Counter</h1>
    <p class="text-4xl font-bold">{{ count }}</p>
    <p class="text-sm text-gray-500">Double: {{ double }}</p>
    <div class="flex gap-2">
      <SButton variant="outline" @click="store.count--">-</SButton>
      <SButton @click="store.increment()">+</SButton>
    </div>
  </div>
</template>
```

```typescript
// src/stores/counter.ts
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  getters: {
    double: state => state.count * 2
  },
  actions: {
    increment() {
      this.count++;
    }
  }
});
```

The counter state survives navigation and SSR hydration — no extra setup needed.

### Theme Toggle

```typescript
// src/stores/theme.ts
import { defineStore } from 'pinia';

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: 'light' as 'light' | 'dark'
  }),
  actions: {
    toggle() {
      this.mode = this.mode === 'light' ? 'dark' : 'light';
    }
  }
});
```

```vue
<!-- src/layouts/default.vue -->
<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useThemeStore } from '~/stores/theme';

const theme = useThemeStore();
const { mode } = storeToRefs(theme);
</script>

<template>
  <div :class="mode">
    <header>
      <SButton variant="ghost" size="sm" @click="theme.toggle()">
        {{ mode === 'light' ? '🌙' : '☀️' }}
      </SButton>
    </header>
    <main><slot /></main>
  </div>
</template>
```

## Resources

- [Pinia Documentation](https://pinia.vuejs.org/)
- [Pinia SSR Guide](https://pinia.vuejs.org/ssr/)
- [Pinia on GitHub](https://github.com/vuejs/pinia)
- [Vue 3 Documentation](https://vuejs.org/)
