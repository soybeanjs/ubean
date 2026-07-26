# ubean Skills

AI Agent skills for the ubean full-stack framework.

## Structure

```
skills/
└── ubean/
    ├── SKILL.md              # Main skill definition (Claude Skills format)
    ├── AGENT_PROMPT.md       # Agent prompt for AI assistants
    ├── command/
    │   └── ubean.md          # CLI command reference
    └── docs/
        ├── guide/            # Getting started guides
        │   ├── quickstart.md
        │   ├── app-modes.md       # Application modes (fullstack/spa/ssg/backend)
        │   ├── routing-modes.md   # Route generation modes (virtual/file/both)
        │   ├── pages-routing/
        │   │   ├── overview.md
        │   │   ├── loaders.md
        │   │   └── actions.md
        │   ├── i18n.md
        │   └── islands.md
        ├── reference/        # API reference
        │   └── api/
        └── integrations/     # Integration guides
            ├── database.md
            ├── auth.md
            └── icons.md
```

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
description: Full-stack web framework powered by Vite, Hono, and Vue
version: 0.0.1
category: Web Framework
keywords: [vue, vite, hono, full-stack, ssr]
---
```

## Related Packages

- `ubean`: Core framework package (npm name: `ubean`)
- `@ubean/auth`: Better Auth integration
- `@ubean/icon`: Built-in icon system (UbeanIcon component)
- `@ubean/pwa`: PWA manifest + service worker
- `@ubean/image`: Image optimization
- `@ubean/content`: Content management
- `@ubean/fonts`: Font optimization
- `@soybeanjs/ui`: UI component library (includes SIcon for theme-aware icons)
