import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import {
  parseMarkdown,
  parseFrontmatter,
  markdownToHtml,
  extractHeadings,
  extractExcerpt
} from '../../src/core/markdown';
import { createVueRenderer } from '../../src/core/vue/renderer';
import { renderPage } from '../../src/runtime/pages/protocol';
import type { PageObject } from '../../src/runtime/pages/protocol';

describe('Integration: Markdown page processing', () => {
  it('parses frontmatter and markdown content for page rendering', () => {
    const md = `---
title: Hello World
description: A test page
date: 2024-01-15
layout: default
---

# Welcome

This is a **markdown** page with some content.

## Section One

Content for section one.

- Item 1
- Item 2
- Item 3

<!-- more -->

More content after excerpt.
`;

    const { data, content } = parseFrontmatter(md);
    expect(data.title).toBe('Hello World');
    expect(data.description).toBe('A test page');
    expect(data.date).toBe('2024-01-15');
    expect(data.layout).toBe('default');
    expect(content).toContain('# Welcome');

    const parsed = parseMarkdown(md, { excerpt: true });
    expect(parsed.frontmatter.title).toBe('Hello World');
    expect(parsed.excerpt).toBeTruthy();
    expect(parsed.headings.length).toBeGreaterThanOrEqual(2);
    expect(parsed.headings[0].text).toBe('Welcome');
  });

  it('extracts headings with proper ids and levels', () => {
    const md = `# Main Title
## Section A
### Subsection A1
## Section B
### Subsection B1
#### Deep nested`;

    const headings = extractHeadings(md);
    expect(headings.length).toBe(6);
    expect(headings[0].level).toBe(1);
    expect(headings[0].id).toBeTruthy();
    expect(headings[1].level).toBe(2);
    expect(headings[1].text).toBe('Section A');
    expect(headings[5].level).toBe(4);
  });

  it('extracts excerpt before separator', () => {
    const md = `First paragraph of content.
Second line of intro.

<!-- more -->

Rest of the content that should not be in excerpt.
`;

    const excerpt = extractExcerpt(md);
    expect(excerpt).toContain('First paragraph');
    expect(excerpt).not.toContain('Rest of the content');
  });

  it('converts markdown to basic HTML', () => {
    const md = '# Hello\n\nThis is **bold** and *italic*.\n\n- List item';
    const html = markdownToHtml(md);
    expect(html).toContain('<h1');
    expect(html).toContain('Hello');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>List item</li>');
  });

  it('renders a markdown page through Vue SSR pipeline', async () => {
    const md = `---
title: Blog Post
description: My first post
---

# Blog Post Title

This is the **first** paragraph.
`;

    const parsed = parseMarkdown(md, { excerpt: true, headingIds: true });

    const MarkdownPage = defineComponent({
      name: 'MarkdownPage',
      props: {
        html: { type: String, required: true },
        title: { type: String, default: '' }
      },
      render(this: any) {
        return h('article', { class: 'markdown-page', 'data-title': this.title }, [h('div', { innerHTML: this.html })]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => MarkdownPage,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/blog/post.md',
      props: {
        html: markdownToHtml(parsed.content),
        title: parsed.frontmatter.title
      },
      params: {},
      url: '/blog/post',
      head: {
        title: parsed.frontmatter.title || '',
        meta: parsed.frontmatter.description
          ? [{ name: 'description', content: parsed.frontmatter.description as string }]
          : []
      }
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Blog Post</title>');
    expect(html).toContain('Blog Post Title');
    expect(html).toContain('markdown-page');
    expect(html).toContain('<strong>first</strong>');
  });
});

describe('Integration: Error page rendering', () => {
  it('renders error page with proper status code information', async () => {
    const ErrorPage = defineComponent({
      name: 'ErrorPage',
      props: {
        statusCode: { type: Number, default: 500 },
        message: { type: String, default: 'Internal Server Error' }
      },
      render(this: any) {
        return h('div', { class: 'error-page' }, [h('h1', String(this.statusCode)), h('p', this.message)]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => ErrorPage,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/error.vue',
      props: { statusCode: 404, message: 'Page Not Found' },
      params: {},
      url: '/__error_page__',
      errors: { statusCode: '404' }
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(html).toContain('404');
    expect(html).toContain('Page Not Found');
    expect(html).toContain('error-page');
  });

  it('renders validation error page with field errors', async () => {
    const ValidationErrorPage = defineComponent({
      name: 'ValidationError',
      props: {
        errors: { type: Object, default: () => ({}) }
      },
      render(this: any) {
        return h('div', { class: 'validation-error' }, [
          h('h2', 'Please fix the following errors:'),
          h(
            'ul',
            Object.entries(this.errors).map(([field, msg]) => h('li', { key: field, 'data-field': field }, String(msg)))
          )
        ]);
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => ValidationErrorPage,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/validation-error.vue',
      props: {
        errors: { email: 'Invalid email format', password: 'Too short' }
      },
      params: {},
      url: '/form',
      errors: { email: 'Invalid email format' }
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(html).toContain('validation-error');
    expect(html).toContain('Please fix the following errors');
    expect(html).toContain('data-field="email"');
    expect(html).toContain('Invalid email format');
  });
});

describe('Integration: Page head and metadata rendering', () => {
  it('renders SEO meta tags including Open Graph and Twitter', async () => {
    const Page = defineComponent({
      name: 'SEOPage',
      render() {
        return h('div', 'SEO Page Content');
      }
    });

    const renderer = createVueRenderer({
      resolvePageComponent: async () => Page,
      resolveLayoutComponent: async () => null
    });

    const pageObj: PageObject = {
      component: 'pages/seo.vue',
      props: {},
      params: {},
      url: '/seo-page',
      head: {
        title: 'SEO Page | ubean',
        meta: [
          { name: 'description', content: 'Page description' },
          { property: 'og:title', content: 'SEO Page' },
          { property: 'og:description', content: 'OG Description' },
          { property: 'og:image', content: 'https://example.com/og.png' },
          { name: 'twitter:card', content: 'summary_large_image' }
        ],
        link: [{ rel: 'canonical', href: 'https://example.com/seo-page' }],
        htmlAttrs: { lang: 'en' }
      }
    };

    const html = await renderPage(pageObj, {}, renderer);
    expect(html).toContain('<title>SEO Page | ubean</title>');
    expect(html).toContain('name="description"');
    expect(html).toContain('Page description');
    expect(html).toContain('og:title');
    expect(html).toContain('twitter:card');
    expect(html).toContain('canonical');
    expect(html).toContain('lang="en"');
  });
});
