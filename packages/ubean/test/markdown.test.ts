import { describe, it, expect } from 'vitest';
import { parseFrontmatter, parseMarkdown, markdownToHtml, extractHeadings, extractExcerpt } from '../src/core/markdown';

describe('Markdown parser', () => {
  describe('parseFrontmatter', () => {
    it('parses empty frontmatter', () => {
      const { data, content } = parseFrontmatter(`---
---

# Hello
`);
      expect(data).toEqual({});
      expect(content).toContain('# Hello');
    });

    it('parses basic string values', () => {
      const { data } = parseFrontmatter(`---
title: Hello World
description: This is a test
---

Content here
`);
      expect(data.title).toBe('Hello World');
      expect(data.description).toBe('This is a test');
    });

    it('parses boolean values', () => {
      const { data } = parseFrontmatter(`---
published: true
draft: false
---
`);
      expect(data.published).toBe(true);
      expect(data.draft).toBe(false);
    });

    it('parses numbers', () => {
      const { data } = parseFrontmatter(`---
order: 42
price: 19.99
---
`);
      expect(data.order).toBe(42);
      expect(data.price).toBe(19.99);
    });

    it('parses null values', () => {
      const { data } = parseFrontmatter(`---
image: null
---
`);
      expect(data.image).toBe(null);
    });

    it('parses quoted strings', () => {
      const { data } = parseFrontmatter(`---
title: "Hello: World"
author: 'John Doe'
---
`);
      expect(data.title).toBe('Hello: World');
      expect(data.author).toBe('John Doe');
    });

    it('parses array values', () => {
      const { data } = parseFrontmatter(`---
tags: [javascript, typescript, vue]
nums: [1, 2, 3]
---
`);
      expect(data.tags).toEqual(['javascript', 'typescript', 'vue']);
      expect(data.nums).toEqual([1, 2, 3]);
    });

    it('parses nested dot notation keys', () => {
      const { data } = parseFrontmatter(`---
seo.title: Page Title
seo.description: Meta desc
---
`);
      expect(data.seo).toEqual({ title: 'Page Title', description: 'Meta desc' });
    });

    it('returns content without frontmatter', () => {
      const { content } = parseFrontmatter(`---
title: Test
---

First paragraph

Second paragraph
`);
      expect(content).not.toContain('---');
      expect(content).toContain('First paragraph');
      expect(content).toContain('Second paragraph');
    });

    it('returns full content when no frontmatter', () => {
      const input = '# No frontmatter\n\nJust content';
      const { data, content } = parseFrontmatter(input);
      expect(data).toEqual({});
      expect(content).toBe(input);
    });

    it('ignores comments in yaml', () => {
      const { data } = parseFrontmatter(`---
# This is a comment
title: Hello
---
`);
      expect(data.title).toBe('Hello');
    });
  });

  describe('extractHeadings', () => {
    it('extracts h1-h6 headings', () => {
      const headings = extractHeadings(`# Title

## Section 1

### Subsection

Content

## Section 2
`);
      expect(headings).toHaveLength(4);
      expect(headings[0].level).toBe(1);
      expect(headings[0].text).toBe('Title');
      expect(headings[1].level).toBe(2);
      expect(headings[1].text).toBe('Section 1');
      expect(headings[2].level).toBe(3);
      expect(headings[2].text).toBe('Subsection');
      expect(headings[3].level).toBe(2);
    });

    it('generates slug ids', () => {
      const headings = extractHeadings('# Hello World');
      expect(headings[0].id).toBe('hello-world');
    });

    it('ignores headings inside code blocks', () => {
      const headings = extractHeadings(`# Real Heading

\`\`\`js
// #fake heading
const x = 1;
\`\`\`

## Another Real
`);
      expect(headings).toHaveLength(2);
      expect(headings.map(h => h.text)).toContain('Real Heading');
      expect(headings.map(h => h.text)).toContain('Another Real');
    });
  });

  describe('extractExcerpt', () => {
    it('extracts excerpt before more separator', () => {
      const excerpt = extractExcerpt(`First part of content

<!-- more -->

Rest of content
`);
      expect(excerpt).toBe('First part of content');
    });

    it('extracts first short paragraph by default', () => {
      const excerpt = extractExcerpt(
        'This is a short introductory paragraph that is brief enough.\n\nMore content follows.'
      );
      expect(excerpt).toBe('This is a short introductory paragraph that is brief enough.');
    });

    it('returns undefined if no good excerpt', () => {
      const excerpt = extractExcerpt('# Just a heading\n\n```js\ncode block\n```');
      expect(excerpt).toBeUndefined();
    });

    it('supports custom separator', () => {
      const excerpt = extractExcerpt('Intro\n<!-- excerpt -->\nBody', '<!-- excerpt -->');
      expect(excerpt).toBe('Intro');
    });
  });

  describe('markdownToHtml', () => {
    it('converts paragraphs', () => {
      const html = markdownToHtml('Hello world');
      expect(html).toContain('<p>Hello world</p>');
    });

    it('converts headings with ids', () => {
      const html = markdownToHtml('# My Title');
      expect(html).toContain('<h1 id="my-title">My Title</h1>');
    });

    it('converts headings without ids when disabled', () => {
      const html = markdownToHtml('## Section', { headingIds: false });
      expect(html).toContain('<h2>Section</h2>');
      expect(html).not.toContain('id=');
    });

    it('converts bold text', () => {
      const html = markdownToHtml('This is **bold** and __also bold__');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<strong>also bold</strong>');
    });

    it('converts italic text', () => {
      const html = markdownToHtml('This is *italic* and _also italic_');
      expect(html).toContain('<em>italic</em>');
      expect(html).toContain('<em>also italic</em>');
    });

    it('converts inline code', () => {
      const html = markdownToHtml('Use `const x = 1`');
      expect(html).toContain('<code>const x = 1</code>');
    });

    it('converts strikethrough', () => {
      const html = markdownToHtml('~~old text~~');
      expect(html).toContain('<del>old text</del>');
    });

    it('converts links', () => {
      const html = markdownToHtml('[Click here](https://example.com)');
      expect(html).toContain('<a href="https://example.com">Click here</a>');
    });

    it('converts images', () => {
      const html = markdownToHtml('![Alt text](/image.png)');
      expect(html).toContain('<img src="/image.png" alt="Alt text">');
    });

    it('converts unordered lists', () => {
      const html = markdownToHtml('- Item 1\n- Item 2\n- Item 3');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>Item 1</li>');
      expect(html).toContain('<li>Item 2</li>');
      expect(html).toContain('</ul>');
    });

    it('converts ordered lists', () => {
      const html = markdownToHtml('1. First\n2. Second\n3. Third');
      expect(html).toContain('<ol>');
      expect(html).toContain('<li>First</li>');
      expect(html).toContain('</ol>');
    });

    it('converts blockquotes', () => {
      const html = markdownToHtml('> This is a quote');
      expect(html).toContain('<blockquote>This is a quote</blockquote>');
    });

    it('converts code blocks', () => {
      const html = markdownToHtml('```js\nconst x = 1;\n```');
      expect(html).toContain('<pre><code class="language-js">');
      expect(html).toContain('const x = 1;');
    });

    it('converts horizontal rules', () => {
      const html = markdownToHtml('Above\n\n---\n\nBelow');
      expect(html).toContain('<hr>');
    });

    it('escapes HTML in text', () => {
      const html = markdownToHtml('Use <script>alert("xss")</script>');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('supports custom highlighter', () => {
      const html = markdownToHtml('```js\nhello\n```', {
        highlighter: (code, _lang) => `<span class="hl">${code}</span>`
      });
      expect(html).toContain('<span class="hl">hello</span>');
    });
  });

  describe('parseMarkdown', () => {
    it('returns full parsed result', () => {
      const md = `---
title: My Post
date: 2024-01-15
description: First post
---

# My Post

Welcome to my blog.
`;
      const result = parseMarkdown(md);
      expect(result.frontmatter.title).toBe('My Post');
      expect(result.frontmatter.date).toBe('2024-01-15');
      expect(result.headings).toHaveLength(1);
      expect(result.headings[0].text).toBe('My Post');
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('Welcome to my blog');
    });

    it('includes excerpt by default', () => {
      const md = `# Hello

This is the introduction paragraph.

More content here.
`;
      const result = parseMarkdown(md);
      expect(result.excerpt).toBe('This is the introduction paragraph.');
    });

    it('does not include excerpt when disabled', () => {
      const result = parseMarkdown('# Hi\n\nContent', { excerpt: false });
      expect(result.excerpt).toBeUndefined();
    });
  });
});
