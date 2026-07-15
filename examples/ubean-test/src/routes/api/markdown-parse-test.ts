import {
  defineHandler,
  parseMarkdown,
  parseFrontmatter,
  markdownToHtml,
  extractHeadings,
  extractExcerpt,
  defineMarkdownPage
} from 'ubean';

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'parse';

  if (action === 'parse') {
    const samples = [
      '# Hello World',
      '## Subsection\n\nThis is a **bold** and *italic* text.',
      '- Item 1\n- Item 2\n- Item 3',
      '> This is a quote'
    ];
    const results = samples.map(md => parseMarkdown(md));
    return c.json({
      action: 'parse',
      results,
      allHaveHtml: results.every(r => !!r.html)
    });
  }

  if (action === 'frontmatter') {
    const samples = [
      '---\ntitle: Test Post\ntags:\n  - foo\n  - bar\npublished: true\n---\n\n# Content here',
      '---\ntitle: Second Post\nauthor: Jane\n---\n\n# Body',
      '---\nlayout: default\n---\n\n# No title'
    ];
    const results = samples.map(md => {
      const { data, content } = parseFrontmatter(md);
      return { frontmatter: data, content };
    });
    return c.json({
      action: 'frontmatter',
      results,
      allHaveFrontmatter: results.every(r => r.frontmatter !== undefined)
    });
  }

  if (action === 'headings') {
    const md = `# Title\n\n## Section A\n\n### Subsection\n\n## Section B\n\nText\n\n### Another Sub`;
    const headings = extractHeadings(md);
    return c.json({
      action: 'headings',
      headings,
      count: headings.length,
      allHeadings: headings.length > 0 && headings.every(h => !!h.id),
      levels: headings.map(h => h.level)
    });
  }

  if (action === 'excerpt') {
    const samples = [
      '# Title\n\nThis is the first paragraph that should be extracted as an excerpt. It has enough text.',
      'Some intro text here.\n\nSecond paragraph should not be in excerpt.',
      'Just a paragraph of content that is short enough.'
    ];
    const excerpts = samples.map(md => extractExcerpt(md));
    return c.json({
      action: 'excerpt',
      excerpts,
      allNonEmpty: excerpts.every(e => typeof e === 'string' && e.length > 0)
    });
  }

  if (action === 'html') {
    const samples = [
      '# Hello',
      '**bold** *italic* ~~strike~~ `code`',
      '- list item 1\n- list item 2',
      '> quote\n\n[link](https://example.com)'
    ];
    const htmls = samples.map(md => markdownToHtml(md));
    return c.json({
      action: 'html',
      htmls,
      allContainHtml: htmls.every(h => typeof h === 'string' && h.includes('<'))
    });
  }

  if (action === 'definePage') {
    const page = defineMarkdownPage({
      path: '/test-md-page',
      content: '# Test Page\n\nContent here',
      frontmatter: { title: 'Test', layout: 'default' }
    });
    return c.json({
      action: 'definePage',
      hasPath: !!page.path,
      path: page.path,
      hasContent: !!page.content,
      hasFrontmatter: page.frontmatter !== undefined
    });
  }

  return c.json({
    actions: ['parse', 'frontmatter', 'headings', 'excerpt', 'html', 'definePage']
  });
});
