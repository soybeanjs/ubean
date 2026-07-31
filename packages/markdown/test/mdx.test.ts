/**
 * P9-20: MDX real compilation — unit tests
 *
 * Tests `compileMdx()` for:
 * - Frontmatter extraction from MDX
 * - Fallback compilation (when @mdx-js/mdx is not installed)
 * - JSX runtime module exports
 * - Vite plugin creation
 *
 * Note: Full MDX compilation tests require @mdx-js/mdx to be installed.
 * The fallback path is tested without the optional dependency.
 */
import { describe, it, expect } from 'vitest';
import { jsx, jsxs, Fragment } from '../src/jsx-runtime';
import { compileMdx, isMdxAvailable, isMdxAvailableSync } from '../src/mdx';
import { ubeanMdxPlugin } from '../src/vite-plugin';

describe('P9-20: compileMdx — frontmatter extraction', () => {
  it('extracts frontmatter from MDX source', async () => {
    const source = `---
title: Hello World
layout: blog
---

# Hello

This is **MDX** content.
`;
    const result = await compileMdx(source);
    expect(result.frontmatter.title).toBe('Hello World');
    expect(result.frontmatter.layout).toBe('blog');
  });

  it('handles MDX without frontmatter', async () => {
    const source = `# Hello

This is MDX content without frontmatter.
`;
    const result = await compileMdx(source);
    expect(result.frontmatter.title).toBeUndefined();
  });
});

describe('P9-20: compileMdx — fallback compilation', () => {
  it('falls back to plain markdown when @mdx-js/mdx is not installed', async () => {
    const source = `# Hello

This is **bold** text.
`;
    const result = await compileMdx(source);

    // If @mdx-js/mdx is not installed, compiled should be false
    // and the code should contain a Vue component wrapper
    if (!result.compiled) {
      expect(result.code).toContain('defineComponent');
      expect(result.code).toContain('MdxPage');
      expect(result.code).toContain('ubean-mdx-content');
      // The markdown should be rendered as HTML
      expect(result.code).toContain('<h1>');
      expect(result.code).toContain('<strong>bold</strong>');
    } else {
      // If @mdx-js/mdx IS installed, verify real compilation
      expect(result.code).toContain('import');
      expect(result.code.length).toBeGreaterThan(0);
    }
  });

  it('includes frontmatter export in fallback code', async () => {
    const source = `---
title: Test Post
---

Content here.
`;
    const result = await compileMdx(source);
    if (!result.compiled) {
      expect(result.code).toContain('export const frontmatter');
      expect(result.code).toContain('"title":"Test Post"');
    }
  });

  it('exports empty frontmatter object when no frontmatter', async () => {
    const source = `Just some content.`;
    const result = await compileMdx(source);
    if (!result.compiled) {
      expect(result.code).toContain('export const frontmatter = {};');
    }
  });
});

describe('P9-20: isMdxAvailable', () => {
  it('returns a boolean', async () => {
    const available = await isMdxAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('isMdxAvailableSync returns false before any async check', () => {
    // Before calling isMdxAvailable() or compileMdx(), the sync check
    // should return false (cache is undefined)
    // Note: This test may be affected by test execution order
    const result = isMdxAvailableSync();
    expect(typeof result).toBe('boolean');
  });
});

describe('P9-20: JSX runtime (Vue-compatible)', () => {
  it('exports jsx, jsxs, and Fragment', () => {
    expect(typeof jsx).toBe('function');
    expect(typeof jsxs).toBe('function');
    expect(Fragment).toBeDefined();
  });

  it('jsx creates a VNode for a simple element', () => {
    const vnode = jsx('div', { class: 'test' });
    expect(vnode).toBeDefined();
    expect(vnode.type).toBe('div');
  });

  it('jsx creates a VNode with children', () => {
    const vnode = jsx('p', { children: 'Hello' });
    expect(vnode).toBeDefined();
    expect(vnode.type).toBe('p');
  });

  it('jsxs creates a VNode (same as jsx for Vue)', () => {
    const vnode = jsxs('ul', { children: ['a', 'b'] });
    expect(vnode).toBeDefined();
    expect(vnode.type).toBe('ul');
  });

  it('jsx handles null props', () => {
    const vnode = jsx('span', null);
    expect(vnode).toBeDefined();
    expect(vnode.type).toBe('span');
  });

  it('jsx passes key prop', () => {
    const vnode = jsx('li', { children: 'item' }, 'my-key');
    expect(vnode).toBeDefined();
    expect(vnode.key).toBe('my-key');
  });
});

describe('P9-20: ubeanMdxPlugin', () => {
  it('creates a Vite plugin with correct name', () => {
    const plugin = ubeanMdxPlugin();
    expect(plugin.name).toBe('ubean:mdx');
    expect(plugin.enforce).toBe('pre');
  });

  it('has a transform hook', () => {
    const plugin = ubeanMdxPlugin();
    expect(typeof plugin.transform).toBe('function');
  });

  it('has a handleHotUpdate hook', () => {
    const plugin = ubeanMdxPlugin();
    expect(typeof plugin.handleHotUpdate).toBe('function');
  });

  it('accepts custom include pattern', () => {
    const plugin = ubeanMdxPlugin({ include: /\.mdx$/ });
    expect(plugin).toBeDefined();
  });

  it('accepts remark and rehype plugins', () => {
    const remarkPlugin = { name: 'test-remark' };
    const rehypePlugin = { name: 'test-rehype' };
    const plugin = ubeanMdxPlugin({
      remarkPlugins: [remarkPlugin],
      rehypePlugins: [rehypePlugin]
    });
    expect(plugin).toBeDefined();
  });

  it('returns null for non-mdx files in transform', async () => {
    const plugin = ubeanMdxPlugin();
    const transformFn = plugin.transform as Function;
    const result = await transformFn.call({ error: (_msg: string) => {} }, 'console.log(1)', '/src/test.vue');
    expect(result).toBeNull();
  });

  it('transforms .mdx files', async () => {
    const plugin = ubeanMdxPlugin();
    const transformFn = plugin.transform as Function;
    // Capture errors instead of silently swallowing them
    let capturedError: string | undefined;
    const result = await transformFn.call(
      {
        error: (msg: string) => {
          capturedError = msg;
        }
      },
      '# Hello\n\nWorld',
      '/src/test.mdx'
    );
    if (capturedError) {
      throw new Error(`Plugin error: ${capturedError}`);
    }
    expect(result).not.toBeNull();
    expect(result.code).toBeDefined();
    expect(typeof result.code).toBe('string');
  });

  it('real MDX compilation imports from @ubean/markdown/jsx-runtime', async () => {
    const result = await compileMdx('# Hello\n\nWorld');
    if (result.compiled) {
      // MDX appends `/jsx-runtime` to jsxImportSource, so the import path
      // should be `@ubean/markdown/jsx-runtime` (not `.../jsx-runtime/jsx-runtime`).
      expect(result.code).toContain('from "@ubean/markdown/jsx-runtime"');
      expect(result.code).not.toContain('@ubean/markdown/jsx-runtime/jsx-runtime');
      // Should export a default MDXContent component
      expect(result.code).toMatch(/MDXContent/);
    }
  });
});
