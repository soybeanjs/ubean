---
title: Vite Plugin Migration
description: What changed when dev / build / preview moved from the CLI into the Vite plugin (ADR-0012), and what to check in your config.
---

# Vite Plugin Migration

The dev / build / preview lifecycles are owned by the Vite plugin (ADR-0012). `ubeanPlugin()` registers the `client` and `ubean` environments plus `builder.buildApp` in its `config` hook, so `vite dev | build | preview` on its own is the complete toolchain — and the CLI no longer builds its own orchestration.

```bash
ubean dev      # ≡ vite dev
ubean build    # ≡ vite build
ubean preview  # ≡ vite preview
```

The convergence is complete. `experimental.viteBuilder` was the temporary switch that gated the migration; it has been **deleted** together with the legacy orchestration, so writing it now is a no-op — the field is ignored as unknown. There is nothing to enable, and the two command paths produce item-for-item identical output.

## Config migration

| What you have | What to do |
| --- | --- |
| Top-level `preset: 'vercel'` | Move it to `build: { preset: 'vercel' }`. The top-level field was never read: it was silently ignored and the build fell back to the default `node` preset (a warning about the unknown config option is now printed). |
| `experimental: { viteBuilder: … }` | Delete the entry. The switch no longer exists; leaving it in place is ignored as an unknown field. |
| A `prerender.staticDir` default you depended on | Set the directory explicitly. The default is no longer the hardcoded `dist/public`; it derives from the **actual** `build.outputDir` as `<outputDir>/public`, which is what makes `--outDir` and preset-provided directories hold. |
| Deployment scripts looking for `runtime.entry` / `output.serverDir` | Don't look there. Those fields are declaration-only and have no consumer in this repo. The real output is always `<build.outputDir>/{public,server}`, with `server/{server,worker,handler}.mjs` — one of the three, per the preset's entry type. |
| `NODE_ENV=test` in CI builds | Use `NODE_ENV=production`, or leave it unset. Vite honours an explicit `NODE_ENV`, and `test` ships Vue's development code in the client bundle (measured: entry gzip 45.2 → 75.9 kB). `ubean build` now warns about it. |

```ts
// ubean.config.ts — the top-level preset is ignored; use build.preset
export default defineConfig({
  build: { preset: 'vercel' }
});
```

`vite build` ignores `--outDir` and always writes `build.outputDir`.

## Dev behavior

- Editing a client file triggers a **full page reload** (Vite HMR semantics).
- Editing a server file goes through file-scoped invalidation: only the matched file and its importer chain are recomputed, and unrelated module singletons survive.
- Request routing and the host app belong to the plugin (in `@ubean/build`); the CLI no longer builds its own HTTP server.
- The `/_devtools` entry works. The URL the CLI banner used to advertise returned 404 — it redirected into the `__` reserved namespace and was classified as an application request.

## Build behavior

- Asset tags (the client entry `<script>` and stylesheets) are inlined into the server bundle **at build time**; nothing reads `<public>/.vite/manifest.json` at runtime.
- Prerendered HTML lands in the actual output directory (`<build.outputDir>/public`). It used to be written to `dist/public` no matter what `--outDir` said, which split one build across two directories.
- `analyze:check` compares against the baseline chunk name list in addition to the size ceilings: a chunk present in the baseline but missing from the current build fails outright (that is how an entire class of island chunks once slipped through).

## Preview behavior

- fullstack / backend preview **the artifact itself**: the process loads `createFetchHandler()` from the built `dist/server/entry.mjs`, and static plus prerendered HTML is served by the artifact's own `serveStatic` — the same shape as production. It no longer spawns a Node server and probes a port.
- spa / ssg share one static resolver implementation with the CLI's built-in static server; when `vite preview` cannot start, preview degrades to that server.
- cloudflare artifacts are previewed through miniflare (the optional `miniflare` dependency). When it is missing, preview prints an install hint and the `wrangler dev` alternative.
- spa mode now emits `public/index.html` (with the client entry script and stylesheets). Previously the spa output contained only `assets/`, so a deploy had no entry file — the docs had long promised "static `index.html` + assets" while the implementation disagreed.

## Deploying to Cloudflare Workers

The cloudflare preset's worker artifact runs directly on workerd. The generated `wrangler.toml` pins `compatibility_flags = ["nodejs_compat"]` and `compatibility_date = "2024-09-23"` (the date from which `nodejs_compat` means v2, providing the `process` and `Buffer` globals). The worker bundle is fully bundled and contains no Node built-ins — `node:fs` is replaced at build time with a stub that throws.

Three constraints follow:

1. **Never import a build-time API such as `ubean/build` from a runtime route.** It pulls the whole build toolchain into the server bundle: on Node that is wasted size, but on a worker the **build fails outright**, because the toolchain's optional dependencies (`velocityjs`, `atpl`, …) cannot be bundled.
2. **Workers have no filesystem.** Static assets are served by the platform layer — `assets.directory` is already written into the generated `wrangler.toml`, and `node:fs` is a throwing stub — so cache with `memory`, or with KV / object storage.
3. **Runtime dependencies are inlined into the worker bundle**, which therefore is noticeably larger. A worker cannot resolve bare specifiers, so this is inherent to worker deployment; wrangler bundling behaves the same way. Server bundles for worker targets **are minified** (measured 2.6 MB → 1.36 MB), while Node targets stay unminified to keep readable stack traces.

## Rollback

Rollback is a version rollback only. The config switch is gone, so there is no in-config escape hatch back to the legacy orchestration.

Projects without a user `vite.config.ts` are unaffected: the CLI still injects the builtin plugin, and that path was never part of the legacy orchestration — both paths share it.

## Next steps

- <Link to="/guide/app-modes">App Modes</Link> — how `mode` drives what a build produces, and what each mode previews.
- <Link to="/guide/quickstart">Quickstart</Link> — scripts, plain Vite commands, and `ubeanPlugin()`.
