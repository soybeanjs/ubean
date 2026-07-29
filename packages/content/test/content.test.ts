import { describe, it, expect, beforeEach } from 'vitest';
import { getDirname, getBasename, getExtension, getStem, normalizePath, pathToTitle } from '@ubean/utils';
import {
  generateId,
  parseFrontmatter,
  parseMarkdown,
  createQueryBuilder,
  buildNavigation,
  parseContent,
  createContentCollection,
  defineContentCollection
} from '../src/core';
import {
  configureContentRuntime,
  queryCollection,
  getContentItem,
  registerContent,
  fetchContentNavigation,
  parseContentFile
} from '../src/runtime';
import type { ContentDocument } from '../src/types';

describe('ubean-content core utilities', () => {
  describe('path utilities', () => {
    it('generateId creates consistent content IDs', () => {
      expect(generateId('posts/hello.md', 'md')).toBe('content:posts/hello');
      expect(generateId('/posts/hello-world.md', 'md')).toBe('content:posts/hello-world');
    });

    it('getDirname extracts directory', () => {
      expect(getDirname('posts/hello.md')).toBe('posts');
      expect(getDirname('hello.md')).toBe('/');
      expect(getDirname('/docs/guide/getting-started.md')).toBe('/docs/guide');
    });

    it('getBasename extracts filename', () => {
      expect(getBasename('posts/hello.md')).toBe('hello.md');
      expect(getBasename('/docs/index.md')).toBe('index.md');
    });

    it('getExtension extracts extension', () => {
      expect(getExtension('hello.md')).toBe('md');
      expect(getExtension('photo.JPG')).toBe('jpg');
      expect(getExtension('noext')).toBe('');
    });

    it('getStem removes extension', () => {
      expect(getStem('hello.md')).toBe('hello');
      expect(getStem('archive.tar.gz')).toBe('archive.tar');
    });

    it('normalizePath normalizes paths', () => {
      expect(normalizePath('hello')).toBe('/hello');
      expect(normalizePath('/hello/world/')).toBe('/hello/world');
      expect(normalizePath('posts//drafts/')).toBe('/posts/drafts');
    });

    it('pathToTitle generates title from path', () => {
      expect(pathToTitle('hello-world.md')).toBe('Hello World');
      expect(pathToTitle('posts/my-first-post.md')).toBe('My First Post');
    });
  });

  describe('parseFrontmatter', () => {
    it('parses YAML frontmatter', () => {
      const md = `---
title: Hello World
description: A test post
date: 2024-01-01
draft: false
---
Content here`;
      const { data, content } = parseFrontmatter(md);
      expect(data.title).toBe('Hello World');
      expect(data.description).toBe('A test post');
      expect(data.draft).toBe(false);
      expect(content).toBe('Content here');
    });

    it('handles arrays in frontmatter', () => {
      const md = `---
tags:
- vue
- javascript
- tutorial
---
Body`;
      const { data } = parseFrontmatter(md);
      expect(Array.isArray(data.tags)).toBe(true);
      expect(data.tags).toContain('vue');
    });

    it('returns empty data when no frontmatter', () => {
      const { data, content } = parseFrontmatter('Just plain content');
      expect(Object.keys(data)).toHaveLength(0);
      expect(content).toBe('Just plain content');
    });
  });

  describe('parseMarkdown', () => {
    it('parses headings and builds TOC', () => {
      const md = `# Hello World
Intro paragraph.

## Section 1
Content here.

### Nested
Deep content.

## Section 2
More content.`;
      const body = parseMarkdown(md);
      expect(body.type).toBe('root');
      expect(body.toc).toBeDefined();
      expect(body.toc!.length).toBeGreaterThan(0);
      expect(body.toc![0].text).toBe('Hello World');
      expect(body.toc![0].children.length).toBeGreaterThan(0);
    });

    it('extracts excerpt from more separator', () => {
      const md = `First paragraph that will be excerpt.

<!-- more -->

Rest of content.`;
      const body = parseMarkdown(md);
      expect(body.excerpt).toBeTruthy();
      expect(body.excerpt).toContain('First paragraph');
    });

    it('parses code blocks', () => {
      const md = '```js\nconst x = 1;\n```';
      const body = parseMarkdown(md);
      const codeBlock = body.children.find(c => c.tag === 'pre');
      expect(codeBlock).toBeDefined();
    });

    it('parses horizontal rules', () => {
      const body = parseMarkdown('---');
      expect(body.children.some(c => c.tag === 'hr')).toBe(true);
    });

    it('parses lists', () => {
      const md = `- Item 1\n- Item 2\n- Item 3`;
      const body = parseMarkdown(md);
      const items = body.children.filter(c => c.tag === 'li');
      expect(items.length).toBe(3);
    });
  });

  describe('parseContent', () => {
    it('parses markdown files with frontmatter', () => {
      const raw = `---
title: Test Post
description: Testing
---
# Hello
Content.`;
      const doc = parseContent(raw, 'posts/test.md');
      expect(doc._id).toBe('content:posts/test');
      expect(doc._path).toBe('/posts/test');
      expect(doc.title).toBe('Test Post');
      expect(doc.body).toBeDefined();
      expect(doc._type).toBe('markdown');
      expect(doc._extension).toBe('md');
    });

    it('parses index files to directory path', () => {
      const raw = '# Home';
      const doc = parseContent(raw, 'index.md');
      expect(doc._path).toBe('/');
    });

    it('marks drafts and partials', () => {
      const draft = parseContent('Draft', 'posts/.draft-post.md');
      expect(draft._draft).toBe(true);

      const partial = parseContent('Partial', 'posts/_footer.md');
      expect(partial._partial).toBe(true);
    });
  });

  describe('query builder', () => {
    const docs: ContentDocument[] = [
      {
        _id: '1',
        _path: '/posts/a',
        title: 'A',
        date: '2024-01-02',
        tags: ['vue'],
        _dir: '/posts',
        _file: 'a.md',
        _draft: false,
        _partial: false,
        _type: 'markdown',
        _extension: 'md',
        _empty: false
      },
      {
        _id: '2',
        _path: '/posts/b',
        title: 'B',
        date: '2024-01-03',
        tags: ['js'],
        _dir: '/posts',
        _file: 'b.md',
        _draft: false,
        _partial: false,
        _type: 'markdown',
        _extension: 'md',
        _empty: false
      },
      {
        _id: '3',
        _path: '/posts/c',
        title: 'C',
        date: '2024-01-01',
        tags: ['vue', 'js'],
        _dir: '/posts',
        _file: 'c.md',
        _draft: true,
        _partial: false,
        _type: 'markdown',
        _extension: 'md',
        _empty: false
      },
      {
        _id: '4',
        _path: '/about',
        title: 'About',
        _dir: '/',
        _file: 'about.md',
        _draft: false,
        _partial: false,
        _type: 'markdown',
        _extension: 'md',
        _empty: false
      }
    ];

    it('where filters documents', async () => {
      const qb = createQueryBuilder(docs);
      const results = await qb.where('_path', 'contains', '/posts').find();
      expect(results.length).toBe(3);
    });

    it('where with object query', async () => {
      const qb = createQueryBuilder(docs);
      const results = await qb.where({ _draft: true }).find();
      expect(results.length).toBe(1);
      expect(results[0]._id).toBe('3');
    });

    it('sort orders results', async () => {
      const qb = createQueryBuilder(docs);
      const results = await qb.sort('date', 'asc').find();
      expect(results[0]._id).toBe('3');
      expect(results[2]._id).toBe('2');
    });

    it('limit and skip', async () => {
      const qb = createQueryBuilder(docs);
      const results = await qb.sort('_path').skip(1).limit(2).find();
      expect(results.length).toBe(2);
    });

    it('findOne returns single document', async () => {
      const qb = createQueryBuilder(docs);
      const doc = await qb.where('_path', '/about').findOne();
      expect(doc).not.toBeNull();
      expect(doc!.title).toBe('About');
    });

    it('count returns matching count', async () => {
      const qb = createQueryBuilder(docs);
      const count = await qb.where('_path', 'contains', '/posts').count();
      expect(count).toBe(3);
    });

    it('only selects specific fields', async () => {
      const qb = createQueryBuilder(docs);
      const results = await qb.only(['title', '_path']).find();
      expect(results[0].title).toBeDefined();
      expect(results[0].date).toBeUndefined();
    });

    it('findSurround returns adjacent documents', async () => {
      const qb = createQueryBuilder(docs);
      const surround = await qb.sort('_path').findSurround('/posts/b', { before: 1, after: 1 });
      expect(surround.length).toBe(2);
    });
  });

  describe('navigation', () => {
    it('buildNavigation creates tree structure', () => {
      const docs: ContentDocument[] = [
        {
          _id: '1',
          _path: '/',
          title: 'Home',
          _dir: '/',
          _file: 'index.md',
          _draft: false,
          _partial: false,
          _type: 'markdown',
          _extension: 'md',
          _empty: false,
          navigation: true
        },
        {
          _id: '2',
          _path: '/about',
          title: 'About',
          _dir: '/',
          _file: 'about.md',
          _draft: false,
          _partial: false,
          _type: 'markdown',
          _extension: 'md',
          _empty: false
        },
        {
          _id: '3',
          _path: '/posts/hello',
          title: 'Hello',
          _dir: '/posts',
          _file: 'hello.md',
          _draft: false,
          _partial: false,
          _type: 'markdown',
          _extension: 'md',
          _empty: false
        }
      ];
      const nav = buildNavigation(docs);
      expect(nav.length).toBeGreaterThan(0);
      expect(nav.some(item => item.path === '/')).toBe(true);
      expect(nav.some(item => item.path === '/about')).toBe(true);
    });
  });

  describe('collections', () => {
    it('defineContentCollection creates collection', () => {
      const col = defineContentCollection({
        name: 'blog',
        source: 'content/blog'
      });
      expect(col.name).toBe('blog');
      expect(col.source).toBe('content/blog');
    });

    it('createContentCollection creates collection with documents', async () => {
      const docs = [
        {
          _id: '1',
          _path: '/test',
          _dir: '/',
          _file: 'test.md',
          _draft: false,
          _partial: false,
          _type: 'markdown' as const,
          _extension: 'md',
          _empty: false
        }
      ];
      const col = createContentCollection('test', 'content/test', docs);
      const all = await col.list();
      expect(all.length).toBe(1);
    });
  });
});

describe('ubean-content runtime', () => {
  beforeEach(() => {
    configureContentRuntime();
  });

  it('defineCollection and queryCollection work', async () => {
    const docs = [
      {
        _id: '1',
        _path: '/post-1',
        title: 'Post 1',
        _dir: '/',
        _file: 'post-1.md',
        _draft: false,
        _partial: false,
        _type: 'markdown' as const,
        _extension: 'md',
        _empty: false
      },
      {
        _id: '2',
        _path: '/post-2',
        title: 'Post 2',
        _dir: '/',
        _file: 'post-2.md',
        _draft: false,
        _partial: false,
        _type: 'markdown' as const,
        _extension: 'md',
        _empty: false
      }
    ];
    registerContent('blog', docs);
    const qb = await queryCollection('blog');
    const results = await qb.find();
    expect(results.length).toBe(2);
  });

  it('getContentItem retrieves by path', async () => {
    registerContent('pages', [
      {
        _id: '1',
        _path: '/home',
        title: 'Home',
        _dir: '/',
        _file: 'home.md',
        _draft: false,
        _partial: false,
        _type: 'markdown' as const,
        _extension: 'md',
        _empty: false
      }
    ]);
    const item = await getContentItem('pages', '/home');
    expect(item).not.toBeNull();
    expect(item!.title).toBe('Home');
  });

  it('fetchContentNavigation builds nav', async () => {
    registerContent('pages', [
      {
        _id: '1',
        _path: '/',
        title: 'Home',
        _dir: '/',
        _file: 'index.md',
        _draft: false,
        _partial: false,
        _type: 'markdown' as const,
        _extension: 'md',
        _empty: false
      },
      {
        _id: '2',
        _path: '/about',
        title: 'About',
        _dir: '/',
        _file: 'about.md',
        _draft: false,
        _partial: false,
        _type: 'markdown' as const,
        _extension: 'md',
        _empty: false
      }
    ]);
    const nav = await fetchContentNavigation('pages');
    expect(nav.length).toBeGreaterThan(0);
  });

  it('parseContentFile parses raw content', () => {
    const raw = '---\ntitle: Direct Parse\n---\n# Content';
    const doc = parseContentFile(raw, 'direct.md');
    expect(doc.title).toBe('Direct Parse');
    expect(doc.body).toBeDefined();
  });
});
