---
title: Pinia
description: Pinia state management through the built-in @ubean/integrations/pinia integration.
---

# Pinia State Management (@ubean/integrations/pinia)

`@ubean/integrations/pinia` is ubean's **built-in state management integration** that integrates [Pinia](https://pinia.vuejs.org/) — the official Vue state management library. The module is a thin orchestration layer that wires Pinia's dev optimization and SSR state hydration into ubean's Vite pipeline and SSR protocol. Pinia itself is consumed directly from the `pinia` package.

## Features

- One-line enable: `pinia: true` in `ubean.config.ts` — plugin registration and SSR state hooks are wired for you
- Dev `optimizeDeps` pre-bundling for `pinia` — fast first page load in dev
- SSR state hydration works out of the box, no `defineApp` boilerplate
- Zero-invasion: Pinia API (`createPinia`, `defineStore`, `storeToRefs`, ...) imported directly from `pinia`
- Type-safe configuration via `UbeanPiniaOptions`
- Safe degradation: serialization returns `{}` when `$pinia` is missing; hydration is a no-op when state is `null` or has no `pinia` field

## Installation

`@ubean/integrations/pinia` is a built-in integration (a subpath of `@ubean/integrations`). Install it together with `pinia` in your project:

```bash
pnpm add @ubean/integrations/pinia pinia
```

> `pinia` is a peer dependency — you control its version. `@ubean/integrations/pinia` supports `pinia@^2.0.0 || ^3.0.0`.

## Configuration

### Minimal Setup

One line is enough:

```typescript
// ubean.config.ts
import { defineConfig } from 'ubean';

export default defineConfig({
  pinia: true
});
```

Nothing goes in `src/app.ts`. The framework does three things in the generated client and SSR entries:

1. `app.use(createPinia())` — one fresh instance per app instance (one per SSR request)
2. Wires `serializeState: serializePiniaState`, so server state is serialized into the HTML `__UBEAN_STATE__` script tag
3. Wires `hydrateState: hydratePiniaState`, so the client hydrates before `app.mount()` (stores already hold SSR state)

SSR, CSR, SSG and plain SPA all run the same generated code with no branching: without SSR the serialization hook is simply never called and everything else is unchanged.

### Registering Pinia yourself (optional)

To control instance creation (e.g. to inject plugins via `pinia.use()`), keep writing it in `defineApp`:

```typescript
// src/app.ts
import { createPinia } from 'pinia';
import { defineApp } from 'ubean';

const pinia = createPinia();
pinia.use(myPlugin);

export default defineApp({ plugins: [pinia] });
```

The automatic install is appended after all user plugins and guarded by `$pinia` — it skips when you already installed one, so you never get a second instance. `pinia: true` and a hand-written `createPinia()` coexist; it is not either/or.

### Disabling

To disable the module explicitly (same as omitting it) — pre-bundling and auto-registration both go away:

```typescript
export default defineConfig({
  pinia: false
});

// or
export default defineConfig({
  pinia: { disabled: true }
});

// or
export default defineConfig({
  pinia: { enabled: false }
});
```

To keep pre-bundling but own instance creation, just write `createPinia()` as shown above — the guard steps aside, no switch needed.

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

`@ubean/integrations/pinia` is a thin wrapper. When `pinia: true` is set:

1. **Module system loads** `@ubean/integrations/pinia` and calls `ubeanPiniaPlugin(options)` (where `options` comes from `extractBuiltinOptions(config.pinia)` — an object is passed through as-is minus the module-system `disabled` flag; `true` yields `{}`).

2. **Dev optimizeDeps**: `ubeanPiniaPlugin` adds `pinia` to Vite's `optimizeDeps.include`, ensuring Pinia is pre-bundled for fast first page load in dev. This avoids the dependency scanning delay on the first request.

3. **Auto-registration**: the generated `virtual:ubean-app` module appends an install plugin (guarded by `$pinia`) to the value returned by `resolveAppConfig()`, and fills `base.serializeState` / `base.hydrateState` with defaults. User `defineApp` config merges after base, so hooks you write yourself still override the defaults.

4. **SSR serialization**: `serializeState` is called after `renderToString(app)` completes. The function reads `app.config.globalProperties.$pinia.state.value` and returns `{ pinia: ... }`. The renderer serializes this to JSON and injects it into the HTML as `<script id="__UBEAN_STATE__" type="application/json">`.

5. **Client hydration**: `hydrateState` is called after `applyAppConfig(app, config, 'client')` (which installs plugins in order, including the auto-registered `createPinia()`) but **before** `app.mount()`. The function reads the `pinia` field from the deserialized state and assigns it to `pinia.state.value`.

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
import { ubeanPiniaPlugin, definePiniaConfig } from '@ubean/integrations/pinia';
import { serializePiniaState, hydratePiniaState } from '@ubean/integrations';
import type { UbeanPiniaOptions, PiniaSerializedState } from '@ubean/integrations/pinia';
```

### `ubeanPiniaPlugin(options?: UbeanPiniaOptions): Plugin[]`

Returns an array of Vite plugins. Usually called automatically by the module system; call manually only when integrating outside `ubean.config.ts`.

### `definePiniaConfig(options: UbeanPiniaOptions): UbeanPiniaOptions`

Type-safe helper for authoring `UbeanPiniaOptions` with autocompletion. Transparently returns the input.

### `serializePiniaState(app: VueApp): PiniaSerializedState`

SSR serialization helper. Already wired to `serializeState` when `pinia: true`, so you rarely reference it by hand. Reads `app.config.globalProperties.$pinia.state.value` and returns `{ pinia: <deep-cloned state> }`. Returns `{}` when `$pinia` is not detected (e.g., `createPinia()` not registered) — does not throw.

### `hydratePiniaState(app: VueApp, state: Record<string, unknown> | null): void`

Client hydration helper. Already wired to `hydrateState` when `pinia: true`, so you rarely reference it by hand. Assigns `state.pinia` to `pinia.state.value`. No-op when `state` is `null` or has no `pinia` field. Warns to the console when `$pinia` is not detected on the app (configuration error: `hydrateState` configured but `createPinia()` not registered).

### `UbeanPiniaOptions`

```typescript
export interface UbeanPiniaOptions {
  /** Whether the plugin is enabled (default: true). NOTE: in ubean.config.ts
   * the module-system option is `disabled?: boolean` instead (inverted). */
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

> When configured via `ubean.config.ts`, the framework reads `pinia: true | UbeanPiniaOptions`. The module system passes the options directly to `ubeanPiniaPlugin`, and the same value decides whether auto-registration happens.

## Best Practices

1. **`pinia: true` is enough**: pre-bundling, instance registration, SSR serialization and hydration are all wired by it. Hand-writing `defineApp({ plugins: [createPinia()] })` is only needed to inject `pinia.use()` plugins — the guard skips the automatic install, so you never get two.

2. **One Pinia instance per app**: the automatic install does this once per app instance. When you take over manually, still call `createPinia()` only once. State hydration assumes a single `$pinia` on the app.

3. **Keep server-side Pinia state scoped to a single request**: Each SSR request creates a fresh Vue app (and thus a fresh Pinia). Keep the Pinia instance local to the request — module-scope instances leak state between requests.

4. **Use loaders for request-scoped data**: For data that varies per request (e.g., user-specific data, route params), prefer ubean's page loader/action protocol. Pinia is best for client-side shared state (UI state, cached data, user preferences) that needs to survive route changes.

5. **Hydrate before mount**: The ubean client entry ensures `hydrateState` runs before `app.mount()`. If you customize the entry, preserve this ordering — otherwise stores initialize with defaults and hydration is lost.

6. **Pinia + Islands**: Pinia state is available in the main Vue app. Islands (`v-client.load`, `v-client.idle`, etc.) are separate Vue subtrees — they don't automatically share the main app's Pinia instance. If an island needs Pinia, install it on the island's app or pass state via props.

## Troubleshooting

### Stores reset to defaults after hydration

- Verify `ubean.config.ts` has `pinia: true` (or the object form), not `false` / `enabled: false`
- If you took over the instance manually, check that `createPinia()` is in `defineApp({ plugins: [...] })` (not registered later via `onAppCreated`)
- Inspect the rendered HTML for `<script id="__UBEAN_STATE__" type="application/json">` — it should contain the serialized state
- Verify `hydrateState` runs before `app.mount()` (it does in the default client entry)

### Warning: "hydrateState was called but no $pinia was detected on the app"

This means `hydratePiniaState` was called but the app has no `$pinia`. Two causes:

- You configured `hydrateState: hydratePiniaState` yourself without registering `createPinia()` — add `plugins: [createPinia()]`, or drop the hook and let auto-registration handle it
- The `pinia` config is off (`false` / `enabled: false`) while `app.ts` still carries the `hydrateState` hook — turn the config on, or drop the hook too

### Pinia not pre-bundled in dev

- Verify `pinia: true` (or `pinia: { ... }`) is set in `ubean.config.ts`
- Run `ubean dev` and check Vite's optimizeDeps output — `pinia` should appear in `optimizeDeps.include`
- If using a custom Vite config, ensure `ubeanPiniaPlugin`'s output isn't being filtered out

### Type errors for `@ubean/integrations`

- Run `ubean prepare` to regenerate type declarations
- Verify `tsconfig.json` includes the `@ubean/integrations/pinia` types
- Ensure you import from `@ubean/integrations` (not `@ubean/integrations/pinia`) for the runtime helpers

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
