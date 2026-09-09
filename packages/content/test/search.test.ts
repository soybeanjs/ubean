import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configureContentRuntime,
  registerContent,
  queryCollectionSearchSections,
  parseContentFile
} from '../src/runtime';
import {
  splitDocumentIntoSearchSections,
  generateSearchSections,
  generateSearchSectionsSnapshot,
  tokenizeText,
  createSectionSearch,
  searchSections,
  resolveContentSearchConfig,
  runPagefindIndex
} from '../src/search';
import type { ContentDocument } from '../src/types';
import { useContentSearch } from '../src/vue';

function makeDoc(markdown: string, path = '/docs/guide.md'): ContentDocument {
  return parseContentFile(`---\ntitle: Guide\n---\n\n${markdown}`, path);
}

describe('splitDocumentIntoSearchSections', () => {
  it('splits document by headings with title chains and anchors', () => {
    const doc = makeDoc(
      [
        '# Guide Title',
        '',
        'Intro paragraph about getting started.',
        '',
        '## Installation',
        '',
        'Install with pnpm.',
        '',
        '### pnpm add',
        '',
        'Run the command.',
        '',
        '## Usage',
        '',
        'Use it in your app.'
      ].join('\n')
    );

    // h1 + Installation + pnpm add + Usage（文档以标题开头时无独立 intro section）
    const result = splitDocumentIntoSearchSections(doc);
    expect(result).toHaveLength(4);

    const [h1, install, pnpmAdd, usage] = result;
    expect(h1.level).toBe(1);
    expect(h1.title).toBe('Guide Title');
    expect(h1.id).toBe('/docs/guide#guide-title');
    expect(h1.content).toContain('Intro paragraph');

    expect(install.title).toBe('Installation');
    expect(install.level).toBe(2);
    expect(install.titles).toEqual(['Guide Title']);
    expect(install.id).toBe('/docs/guide#installation');
    expect(install.content).toContain('Install with pnpm');

    expect(pnpmAdd.title).toBe('pnpm add');
    expect(pnpmAdd.level).toBe(3);
    expect(pnpmAdd.titles).toEqual(['Guide Title', 'Installation']);
    expect(pnpmAdd.id).toBe('/docs/guide#pnpm-add');

    expect(usage.title).toBe('Usage');
    expect(usage.titles).toEqual(['Guide Title']);
    expect(usage.content).toContain('Use it in your app');
  });

  it('creates intro section for content before the first heading', () => {
    const doc = makeDoc('Leading paragraph.\n\n## Section\n\nBody.');
    const result = splitDocumentIntoSearchSections(doc);
    expect(result).toHaveLength(2);
    expect(result[0].level).toBe(0);
    expect(result[0].id).toBe('/docs/guide');
    expect(result[0].content).toContain('Leading paragraph');
  });

  it('respects minHeading by treating shallower headings as content', () => {
    const doc = makeDoc('# Big Title\n\nIntro text.\n\n## Section A\n\nContent A.');
    const result = splitDocumentIntoSearchSections(doc, { minHeading: 2 });

    // h1 不切分（文本并入 intro），h2 正常切分
    expect(result).toHaveLength(2);
    expect(result[0].level).toBe(0);
    expect(result[0].content).toContain('Big Title');
    expect(result[0].content).toContain('Intro text');
    expect(result[1].title).toBe('Section A');
    expect(result[1].content).toContain('Content A');
  });

  it('excludes ignored tags (pre by default) from content', () => {
    const doc = makeDoc('## Code\n\n```\nhidden code block\n```\n\nVisible text.');
    const sections = splitDocumentIntoSearchSections(doc);
    expect(sections).toHaveLength(1);
    expect(sections[0].content).toContain('Visible text');
    expect(sections[0].content).not.toContain('hidden code block');
  });

  it('keeps heading-only sections but drops empty intro', () => {
    const doc = makeDoc('## Only Heading');
    const sections = splitDocumentIntoSearchSections(doc);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Only Heading');
    expect(sections[0].content).toBe('');
  });

  it('returns empty for documents without body', () => {
    const doc: ContentDocument = {
      _id: 'content:json',
      _path: '/json',
      _dir: '/',
      _file: 'json.json',
      _type: 'json',
      _extension: 'json',
      _draft: false,
      _partial: false,
      _empty: false
    };
    expect(splitDocumentIntoSearchSections(doc)).toEqual([]);
  });
});

describe('generateSearchSections / snapshot', () => {
  it('filters draft, partial and empty documents', () => {
    const normal = makeDoc('## A\n\ncontent a', '/docs/a.md');
    const draft = makeDoc('## B\n\ncontent b', '/docs/_draft.md');
    draft._draft = true;
    const partial = makeDoc('## C\n\ncontent c', '/docs/_partial.md');
    partial._partial = true;
    const empty = makeDoc('', '/docs/empty.md');
    empty._empty = true;

    const sections = generateSearchSections([normal, draft, partial, empty]);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('A');
  });

  it('generates per-collection snapshot payload', () => {
    const docsA = [makeDoc('## A\n\nx', '/docs/a.md')];
    const docsB = [makeDoc('## B\n\ny', '/blog/b.md')];
    const payload = generateSearchSectionsSnapshot({ docs: docsA, blog: docsB });
    expect(Object.keys(payload)).toEqual(['docs', 'blog']);
    expect(payload.docs).toHaveLength(1);
    expect(payload.blog[0].title).toBe('B');
  });
});

describe('tokenizeText', () => {
  it('splits latin words and lowercases', () => {
    expect(tokenizeText('Hello World, Foo_Bar!')).toEqual(['hello', 'world', 'foo', 'bar']);
  });

  it('segments CJK text into word tokens', () => {
    const tokens = tokenizeText('安装指南');
    // Intl.Segmenter（Node 16+）或 unigram+bigram 降级，均应包含「安装」相关 token
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.some(t => t.includes('安'))).toBe(true);
  });

  it('handles mixed CJK and latin runs', () => {
    const tokens = tokenizeText('vue每个项目');
    expect(tokens).toContain('vue');
    expect(tokens.some(t => /[每项]/.test(t))).toBe(true);
  });

  it('returns empty for empty input', () => {
    expect(tokenizeText('')).toEqual([]);
    expect(tokenizeText('   ')).toEqual([]);
  });
});

describe('createSectionSearch (fallback engine)', () => {
  // minisearch 未安装于测试环境 → 确定性走 fallback 路径
  const sections = [
    { id: '/a', title: 'Installation Guide', titles: [], level: 0, content: 'how to install the package' },
    { id: '/b', title: 'Cooking Recipes', titles: [], level: 0, content: 'install the oven before cooking' },
    { id: '/c', title: '安装指南', titles: [], level: 0, content: '如何安装依赖包' }
  ];

  it('falls back to built-in engine when minisearch is absent', async () => {
    const engine = await createSectionSearch(sections);
    expect(engine.engine).toBe('fallback');
  });

  it('ranks title matches above content matches', async () => {
    const engine = await createSectionSearch(sections);
    const hits = engine.search('install');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe('/a'); // 标题命中 > 正文命中
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('supports CJK queries', async () => {
    const engine = await createSectionSearch(sections);
    const hits = engine.search('安装');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe('/c');
  });

  it('returns empty for no match and empty query', async () => {
    const engine = await createSectionSearch(sections);
    expect(engine.search('zzzznonexistent')).toEqual([]);
    expect(engine.search('')).toEqual([]);
  });

  it('respects limit option', async () => {
    const engine = await createSectionSearch(sections);
    const hits = engine.search('install', { limit: 1 });
    expect(hits).toHaveLength(1);
  });
});

describe('searchSections (one-shot)', () => {
  it('searches without manual engine creation', async () => {
    const hits = await searchSections([{ id: '/x', title: 'Hello', titles: [], level: 0, content: 'world' }], 'hello');
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('/x');
  });
});

describe('resolveContentSearchConfig', () => {
  it('disables search by default in non-SSG modes', () => {
    const config = resolveContentSearchConfig(true, { ssg: false });
    expect(config.sections).toBe(false);
    expect(config.pagefind).toBe(false);
  });

  it('enables search by default in SSG mode', () => {
    const config = resolveContentSearchConfig(true, { ssg: true });
    expect(config.sections).toBe(true);
    expect(config.pagefind).toBe(true);
  });

  it('respects explicit opt-out', () => {
    const config = resolveContentSearchConfig({ search: false }, { ssg: true });
    expect(config.pagefind).toBe(false);
    expect(config.sections).toBe(false);

    const config2 = resolveContentSearchConfig({ search: { provider: false } }, { ssg: true });
    expect(config2.pagefind).toBe(false);
  });

  it('supports explicit opt-in in non-SSG mode with options passthrough', () => {
    const config = resolveContentSearchConfig(
      { search: { provider: 'pagefind', sections: false, pagefind: { verbose: true } } },
      { ssg: false }
    );
    expect(config.pagefind).toBe(true);
    expect(config.sections).toBe(false);
    expect(config.pagefindOptions).toEqual({ verbose: true });
  });
});

describe('runPagefindIndex', () => {
  it('gracefully skips when pagefind is not installed', async () => {
    const result = await runPagefindIndex({ siteDir: '/tmp/nonexistent-site' });
    expect(result.indexed).toBe(false);
    expect(result.reason).toBe('pagefind-not-installed');
  });
});

describe('queryCollectionSearchSections (runtime)', () => {
  beforeEach(() => {
    configureContentRuntime();
  });

  it('returns sections for a registered collection with drafts filtered', async () => {
    const docs = [makeDoc('## A\n\nx', '/docs/a.md'), makeDoc('## B\n\ny', '/docs/_draft.md')];
    docs[1]._draft = true;
    registerContent('docs', docs);

    const sections = await queryCollectionSearchSections('docs');
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('A');
  });

  it('throws for unknown collection', async () => {
    await expect(queryCollectionSearchSections('nope')).rejects.toThrow(/not found/i);
  });
});

describe('useContentSearch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes from provided sections and searches', async () => {
    const sections = [
      { id: '/a', title: 'Installation', titles: [], level: 0, content: 'install deps' },
      { id: '/b', title: 'Deployment', titles: [], level: 0, content: 'deploy the app' }
    ];
    const { status, search, results } = useContentSearch({ sections, immediate: true });
    await vi.waitFor(() => expect(status.value).toBe('ready'));

    const hits = await search('installation');
    expect(hits[0].id).toBe('/a');
    expect(results.value).toHaveLength(1);
    expect(results.value[0].title).toBe('Installation');

    // 空查询清空结果
    await search('');
    expect(results.value).toEqual([]);
  });

  it('loads sections via fetch and filters collections', async () => {
    const payload = {
      docs: [{ id: '/a', title: 'Docs A', titles: [], level: 0, content: 'alpha' }],
      blog: [{ id: '/b', title: 'Blog B', titles: [], level: 0, content: 'beta' }]
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }) as unknown as Response)
    );

    const { status, search } = useContentSearch({ collections: 'blog', immediate: true });
    await vi.waitFor(() => expect(status.value).toBe('ready'));

    const hits = await search('beta');
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('/b');

    // 只包含 blog collection
    const none = await search('alpha');
    expect(none).toHaveLength(0);
  });

  it('reports error status when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response)
    );

    const { status, error, search } = useContentSearch({ immediate: true });
    await vi.waitFor(() => expect(status.value).toBe('error'));
    expect(error.value).toBeInstanceOf(Error);

    const hits = await search('anything');
    expect(hits).toEqual([]);
  });

  it('supports lazy init via immediate: false', async () => {
    const sections = [{ id: '/a', title: 'Lazy', titles: [], level: 0, content: 'lazy content' }];
    const { status, search } = useContentSearch({ sections, immediate: false });
    expect(status.value).toBe('idle');

    const hits = await search('lazy');
    expect(status.value).toBe('ready');
    expect(hits).toHaveLength(1);
  });
});
