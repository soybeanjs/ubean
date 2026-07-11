export interface MarkdownFrontmatter {
  title?: string;
  description?: string;
  date?: string;
  layout?: string;
  seo?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  head?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParsedMarkdown {
  frontmatter: MarkdownFrontmatter;
  content: string;
  excerpt?: string;
  headings: MarkdownHeading[];
  html?: string;
}

export interface MarkdownHeading {
  level: number;
  text: string;
  id: string;
}

export interface MarkdownOptions {
  excerpt?: boolean;
  excerptSeparator?: string;
  headingIds?: boolean;
  highlighter?: (code: string, lang: string) => string;
}

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

export function parseFrontmatter(source: string): { data: MarkdownFrontmatter; content: string } {
  const match = source.match(FRONTMATTER_REGEX);

  if (!match) {
    return { data: {}, content: source };
  }

  const raw = match[1];
  const content = source.slice(match[0].length);
  const data = parseYamlSimple(raw);

  return { data, content };
}

function parseYamlSimple(yaml: string): MarkdownFrontmatter {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();

    if (!key) continue;

    if (value === '') {
      value = true;
    } else if (value === 'true' || value === 'false') {
      value = value === 'true';
    } else if (value === 'null' || value === '~') {
      value = null;
    } else if (!isNaN(Number(value)) && value !== '') {
      const num = Number(value);
      if (isFinite(num)) value = num;
    } else if (
      (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) ||
      (typeof value === 'string' && value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map(v => v.trim())
        .filter(v => v !== '')
        .map(v => {
          if (v === 'true') return true;
          if (v === 'false') return false;
          if (v === 'null') return null;
          if (!isNaN(Number(v))) return Number(v);
          return v.replace(/^["']|["']$/g, '');
        });
    }

    const nestedKeys = key.split('.');
    let current = result;
    for (let i = 0; i < nestedKeys.length - 1; i++) {
      const k = nestedKeys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k] as Record<string, unknown>;
    }
    current[nestedKeys[nestedKeys.length - 1]] = value;
  }

  return result as MarkdownFrontmatter;
}

export function extractHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const lines = markdown.split('\n');
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = slugify(text);
      headings.push({ level, text, id });
    }
  }

  return headings;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function extractExcerpt(markdown: string, separator = '<!-- more -->'): string | undefined {
  const idx = markdown.indexOf(separator);
  if (idx !== -1) {
    return markdown.slice(0, idx).trim();
  }

  const paragraphs = markdown.split('\n\n').filter(p => p.trim() !== '');
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('```')) continue;
    if (trimmed.startsWith('>')) continue;
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) continue;
    if (trimmed.length < 500) {
      return trimmed;
    }
  }

  return undefined;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return html;
}

export function markdownToHtml(markdown: string, options: MarkdownOptions = {}): string {
  const lines = markdown.split('\n');
  const html: string[] = [];

  let inCodeBlock = false;
  let codeLang = '';
  let codeContent: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let inBlockquote = false;
  let blockquoteContent: string[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  }

  function flushList() {
    if (inList && listType) {
      html.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  }

  function flushBlockquote() {
    if (inBlockquote && blockquoteContent.length > 0) {
      html.push(`<blockquote>${renderInline(blockquoteContent.join(' '))}</blockquote>`);
      blockquoteContent = [];
      inBlockquote = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      flushBlockquote();

      if (inCodeBlock) {
        const code = codeContent.join('\n');
        const highlighted = options.highlighter ? options.highlighter(code, codeLang) : escapeHtml(code);
        if (codeLang) {
          html.push(`<pre><code class="language-${escapeHtml(codeLang)}">${highlighted}</code></pre>`);
        } else {
          html.push(`<pre><code>${highlighted}</code></pre>`);
        }
        codeContent = [];
        codeLang = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    if (line.startsWith('---') && line.trim() === '---' && i > 0) {
      flushParagraph();
      flushList();
      flushBlockquote();
      html.push('<hr>');
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushBlockquote();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = options.headingIds !== false ? ` id="${slugify(text)}"` : '';
      html.push(`<h${level}${id}>${renderInline(text)}</h${level}>`);
      continue;
    }

    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      inBlockquote = true;
      blockquoteContent.push(line.slice(2));
      continue;
    } else if (inBlockquote && line.trim() === '') {
      flushBlockquote();
      continue;
    } else if (inBlockquote) {
      blockquoteContent.push(line);
      continue;
    }

    const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);

    if (ulMatch || olMatch) {
      flushParagraph();
      flushBlockquote();
      const currentType: 'ul' | 'ol' = ulMatch ? 'ul' : 'ol';
      const content = ulMatch ? ulMatch[1] : olMatch![1];

      if (!inList || listType !== currentType) {
        flushList();
        html.push(`<${currentType}>`);
        inList = true;
        listType = currentType;
      }

      html.push(`<li>${renderInline(content.trim())}</li>`);
      continue;
    } else if (inList && line.trim() === '') {
      flushList();
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      flushBlockquote();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushBlockquote();

  if (inCodeBlock && codeContent.length > 0) {
    const code = codeContent.join('\n');
    html.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
  }

  return html.join('\n');
}

export function parseMarkdown(source: string, options: MarkdownOptions = {}): ParsedMarkdown {
  const { data: frontmatter, content } = parseFrontmatter(source);
  const headings = extractHeadings(content);
  const excerpt = options.excerpt !== false ? extractExcerpt(content, options.excerptSeparator) : undefined;
  const html = markdownToHtml(content, options);

  return {
    frontmatter,
    content,
    excerpt,
    headings,
    html
  };
}

export function defineMarkdownPage(frontmatter: MarkdownFrontmatter & Record<string, unknown>) {
  return frontmatter;
}
