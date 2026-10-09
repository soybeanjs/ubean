# ubean Skills

AI Agent skills for the ubean full-stack framework.

## Structure

```
skills/
├── README.md                 # This file
└── ubean/
    ├── SKILL.md              # Main skill definition (Claude Skills format)
    ├── AGENT_PROMPT.md       # Agent prompt for AI assistants
    └── command/
        └── ubean.md          # CLI command reference
```

### Which file answers which question

| Question                                                  | File                     |
| --------------------------------------------------------- | ------------------------ |
| What is ubean, what can it do, which API/field do I use?  | `ubean/SKILL.md`         |
| “Act as a ubean assistant for this project” system prompt | `ubean/AGENT_PROMPT.md`  |
| Exact CLI flags, subcommands, env vars, exit codes        | `ubean/command/ubean.md` |

`SKILL.md` and `AGENT_PROMPT.md` overlap by design (the prompt is a distilled subset); when they disagree, `SKILL.md` wins, and source code wins over both.

The full guide / reference / integration docs live in the documentation site source, not here — see [`apps/docs/src/content/`](../apps/docs/src/content/) (`en/` + `zh/`):

- `guide/` — introduction, quickstart, app-modes, vite-plugin-migration, routing-modes, pages-routing (overview / loaders / actions), i18n, content, islands
- `integrations/` — auth, database, electron, icons, pinia, ui
- `reference/` — cache, database, env, i18n, response-helpers, route-helpers
- `architecture/` — overview, architecture, routing, runtime, framework-comparison
- `ecosystem/`, `contributing/engineering`

## Keeping Skills in Sync

The skills are hand-maintained (nothing in `packages/`, scripts or CI reads them). To re-audit against the docs:

1. Diff API tokens: extract every `use*` / `define*` / `create*` / `set*` identifier from `apps/docs/src/content/en/**/*.md` and grep each one across `skills/`.
2. Verify every candidate against real source in `packages/*/src` before writing it down — docs can lag behind code and vice versa.
3. Prefer claims that cite a path or a signature (e.g. `packages/server/src/cron.ts:47 defineScheduled`); that is what makes a stale skill detectable next time.

Known traps worth re-checking on every audit: auto-import defaults (`autoImports.vueRouter` / `vueI18n` / `honoOpenapi` are **off**), `build.preset` vs a top-level `preset`, `ubean/server` vs `ubean` for `validator` / `describeRoute`, and the `src/server/crons` scaffolder path vs the `src/crons` scanner default.

## Usage

This skills directory is designed for AI coding assistants (Claude, etc.) to:

1. Understand ubean framework conventions
2. Provide accurate code examples
3. Reference CLI commands and API
4. Guide through common workflows

## Installation

### Claude Code / Claude Desktop

Copy or symlink this directory to your Claude skills directory:

```bash
# For Claude Code (project-level)
ln -s $(pwd)/skills/ubean .claude/skills/ubean

# For global skills
ln -s $(pwd)/skills/ubean ~/.claude/skills/ubean
```

### Other AI Tools

Any AI tool that supports the Claude Skills format can use the `SKILL.md` file with YAML frontmatter.

## Skill Definition (SKILL.md)

The main skill entry point uses the Claude Skills format with YAML frontmatter:

```yaml
---
name: ubean
display_name: ubean Framework
description: Full-stack Vue meta-framework built on Vite, Hono and Vue. File-based routing, SSR, islands architecture, i18n, DevTools, OpenAPI and multi-platform presets.
version: 0.6.1-beta.3
category: Web Framework
keywords: [vue, vite, hono, full-stack, ssr]
---
```

## Related Packages

- `ubean`: Core framework package (npm name: `ubean`)
- `@ubean/ai`: AI model integration (Vercel AI SDK orchestration)
- `@ubean/auth`: Better Auth integration
- `@ubean/icon`: Iconify integration with custom local SVG collections
- `@ubean/integrations/pwa`: PWA manifest + service worker
- `@ubean/image`: Image optimization
- `@ubean/content`: Content collections
- `@ubean/integrations/fonts`: Font optimization
- `@ubean/integrations/electron`: Electron desktop apps
- `@ubean/integrations/pinia`: Pinia integration + SSR state hydration
- `@ubean/integrations/ui`: @vean/ui integration (UiResolver + styles.css)
- `@vean/ui`: UI component library (includes SIcon for theme-aware icons)
