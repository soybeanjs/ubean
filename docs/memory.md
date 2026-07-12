## Hard Constraints

- Reusable route files must use the ".reuse.ts" extension and export via definePage()
- ALWAYS prioritize built-in components from `@soybeanjs/ui` over custom implementations (applies to all UI components including toast, modal, button, icon, etc.)
- DevTools UI must use `@soybeanjs/ui` component library, preferring pre-styled `S*` components
- Platform adaptation must reference architecture patterns from Nitro and honojs/vite-plugins without direct code copying
- DevTools UI must use Vue native SFC写法 instead of inline string HTML templates
- @soybeanjs/ui Icon components can use any icon from iconify
- DevTools UI must use UnoCSS with `@soybeanjs/unocss-shadcn` preset
- DevTools UI must use `generated: { reset: true, global: true }` in UnoCSS config to auto-generate CSS reset and global styles

## Engineering Conventions

- Route rules implementation includes path pattern compiler supporting `*` (single-segment wildcard) and `**` (multi-segment recursive wildcard)
- Route rules are processed in specificity order: redirect > rewrite > headers, with headers from multiple matching rules merged
- Route rules middleware handles response headers, redirects (with status code configuration), and converts cache rules to `Cache-Control` headers
- Preset system uses `PresetMeta` interface with `name`/`aliases`/`stdName`/`static`/`dev`/`compatibilityDate`/`url` fields
- Presets support inheritance via `extends` field with cycle detection and deep configuration merging
- Presets can be defined as functions for lazy loading and dynamic configuration
- Preset hooks include `build:before`/`build:after`/`compiled`/`dev:setup` lifecycle events
- Preset aliases are supported (e.g., `cf`→`cloudflare`, `default`→`standard`, `node-server`→`node`)
- DevTools UI UnoCSS config uses `presetShadcn()` with base=zinc, primary=indigo, radius=md
- DevTools UI uses `presetSoybean()` for UnoCSS shortcuts

## Lessons Learned

- Direct code copying from reference projects leads to API inconsistency; architecture pattern learning is preferred
