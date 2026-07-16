import { describe, it, expect } from 'vitest';
import {
  parseMarkdown,
  parseFrontmatter,
  extractHeadings,
  extractExcerpt,
  markdownToHtml,
  defineMarkdownPage
} from 'ubean';
import { getJson } from './helper';

describe('Markdown system', () => {
  describe('parseMarkdown()', () => {
    it('parses basic markdown to HTML', () => {
      const result = parseMarkdown('# Hello World');
      expect(result).toBeDefined();
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('Hello World');
    });

    it('parses headings h1-h6', () => {
      const md = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
      const result = parseMarkdown(md);
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('<h2');
      expect(result.html).toContain('<h3');
      expect(result.html).toContain('<h4');
      expect(result.html).toContain('<h5');
      expect(result.html).toContain('<h6');
    });

    it('parses bold and italic', () => {
      const result = parseMarkdown('**bold** and *italic*');
      expect(result.html).toContain('<strong>bold</strong>');
      expect(result.html).toContain('<em>italic</em>');
    });

    it('parses code blocks', () => {
      const result = parseMarkdown('```js\nconst x = 1;\n```');
      expect(result.html).toContain('<code');
      expect(result.html).toContain('const x = 1');
    });

    it('parses inline code', () => {
      const result = parseMarkdown('This is `inline code`');
      expect(result.html).toContain('<code>inline code</code>');
    });

    it('parses links', () => {
      const result = parseMarkdown('[link text](https://example.com)');
      expect(result.html).toContain('<a');
      expect(result.html).toContain('href="https://example.com"');
      expect(result.html).toContain('link text');
    });

    it('parses lists', () => {
      const result = parseMarkdown('- item 1\n- item 2\n- item 3');
      expect(result.html).toContain('<ul');
      expect(result.html).toContain('<li>item 1</li>');
      expect(result.html).toContain('<li>item 2</li>');
    });

    it('parses ordered lists', () => {
      const result = parseMarkdown('1. first\n2. second\n3. third');
      expect(result.html).toContain('<ol');
      expect(result.html).toContain('<li>first</li>');
    });

    it('parses blockquotes', () => {
      const result = parseMarkdown('> This is a quote');
      expect(result.html).toContain('<blockquote');
      expect(result.html).toContain('This is a quote');
    });

    it('parses tables', () => {
      const md = '| Name | Age |\n|------|-----|\n| Alice | 30 |';
      const result = parseMarkdown(md);
      expect(result.html).toContain('<table');
    });

    it('parses horizontal rules', () => {
      const result = parseMarkdown('---');
      expect(result.html).toContain('<hr');
    });
  });

  describe('parseFrontmatter()', () => {
    it('extracts frontmatter from markdown', () => {
      const md = `---
title: Test Post
author: John
---
# Content`;
      const { data: frontmatter, content: body } = parseFrontmatter(md);
      expect(frontmatter.title).toBe('Test Post');
      expect(frontmatter.author).toBe('John');
      expect(body).toContain('# Content');
    });

    it('returns empty frontmatter when none present', () => {
      const md = '# Just content';
      const { data: frontmatter, content: body } = parseFrontmatter(md);
      expect(frontmatter).toEqual({});
      expect(body).toBe('# Just content');
    });

    it('parses nested frontmatter', () => {
      const md = `---
title: Test
meta:
  author: John
  tags:
    - a
    - b
---
Content`;
      const { data: frontmatter } = parseFrontmatter(md);
      expect(frontmatter.title).toBe('Test');
      expect(frontmatter.meta).toBeDefined();
    });
  });

  describe('extractHeadings()', () => {
    it('extracts h1-h6 headings', () => {
      const md = '# Title\n## Section\n### Subsection';
      const headings = extractHeadings(md);
      expect(headings).toHaveLength(3);
      expect(headings[0].level).toBe(1);
      expect(headings[0].text).toBe('Title');
      expect(headings[1].level).toBe(2);
      expect(headings[2].level).toBe(3);
    });

    it('generates slug ids', () => {
      const md = '# Hello World';
      const headings = extractHeadings(md);
      expect(headings[0].id).toBeDefined();
      expect(typeof headings[0].id).toBe('string');
    });

    it('returns empty array for no headings', () => {
      const headings = extractHeadings('Just plain text');
      expect(headings).toHaveLength(0);
    });
  });

  describe('extractExcerpt()', () => {
    it('extracts first paragraph as excerpt', () => {
      const md = 'First paragraph.\n\nSecond paragraph.';
      const excerpt = extractExcerpt(md);
      expect(excerpt).toContain('First paragraph');
    });

    it('respects excerpt separator', () => {
      const md = 'First part.\n\n<!-- more -->\n\nSecond part.';
      const excerpt = extractExcerpt(md);
      expect(excerpt).toContain('First part');
      expect(excerpt).not.toContain('Second part');
    });

    it('returns undefined for empty input', () => {
      const excerpt = extractExcerpt('');
      expect(excerpt).toBeUndefined();
    });
  });

  describe('markdownToHtml()', () => {
    it('converts markdown to HTML string', () => {
      const html = markdownToHtml('# Title\n**bold**');
      expect(typeof html).toBe('string');
      expect(html).toContain('<h1');
      expect(html).toContain('<strong>bold</strong>');
    });

    it('handles empty input', () => {
      const html = markdownToHtml('');
      expect(typeof html).toBe('string');
    });
  });

  describe('defineMarkdownPage()', () => {
    it('returns a page definition', () => {
      const def = defineMarkdownPage({
        path: '/blog/test',
        content: '# Test Page',
        frontmatter: { title: 'Test' }
      });
      expect(def).toBeDefined();
      expect(def.path).toBe('/blog/test');
    });
  });

  describe('HTTP integration - /api/markdown-parse-test', () => {
    it('parse action returns parsed results', async () => {
      const res = await getJson('/api/markdown-parse-test?action=parse');
      expect(res.status).toBe(200);
      const data = res.data as { results: Array<{ html: unknown }> };
      expect(data.results).toHaveLength(4);
      expect(data.results.every(r => Boolean(r.html))).toBe(true);
    });

    it('frontmatter action returns frontmatter results', async () => {
      const res = await getJson('/api/markdown-parse-test?action=frontmatter');
      expect(res.status).toBe(200);
      const data = res.data as { results: Array<{ frontmatter: unknown }> };
      expect(data.results).toHaveLength(3);
      expect(data.results[0].frontmatter).toBeDefined();
    });

    it('headings action returns extracted headings', async () => {
      const res = await getJson('/api/markdown-parse-test?action=headings');
      expect(res.status).toBe(200);
      expect((res.data as { allHeadings: boolean }).allHeadings).toBe(true);
    });

    it('excerpt action returns excerpts', async () => {
      const res = await getJson('/api/markdown-parse-test?action=excerpt');
      expect(res.status).toBe(200);
      expect((res.data as { allNonEmpty: boolean }).allNonEmpty).toBe(true);
    });

    it('html action returns HTML conversion', async () => {
      const res = await getJson('/api/markdown-parse-test?action=html');
      expect(res.status).toBe(200);
      expect((res.data as { allContainHtml: boolean }).allContainHtml).toBe(true);
    });

    it('definePage action returns page definition', async () => {
      const res = await getJson('/api/markdown-parse-test?action=definePage');
      expect(res.status).toBe(200);
      const data = res.data as { hasPath: boolean; hasContent: boolean };
      expect(data.hasPath).toBe(true);
      expect(data.hasContent).toBe(true);
    });
  });
});
