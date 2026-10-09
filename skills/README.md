# ubean Skills

AI Agent skills for the ubean full-stack framework.

## Structure

```
skills/
└── ubean/
    ├── SKILL.md              # Main skill definition (Claude Skills format)
    ├── AGENT_PROMPT.md       # Agent prompt for AI assistants
    └── command/
        └── ubean.md          # CLI command reference
```

The full guide / reference / integration docs live in the documentation site source, not here — see [`apps/docs/src/content/`](../apps/docs/src/content/) (`en/` + `zh/`):

- `guide/` — quickstart, app-modes, routing-modes, pages-routing (overview / loaders / actions), i18n, islands, content
- `reference/` — cache, database, env, i18n, response-helpers, route-helpers
- `integrations/` — auth, database, electron, icons, pinia, ui
- `architecture/` — overview, architecture, routing, runtime, framework-comparison

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
