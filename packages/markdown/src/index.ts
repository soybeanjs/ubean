import { createMarkdownExit } from 'markdown-exit';
import type { MarkdownExit } from 'markdown-exit';

export interface MarkdownFrontmatter {
  title?: string;
  description?: string;
  date?: string;
  layout?: string | false;
  path?: string;
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
  html?: boolean;
  linkify?: boolean;
  breaks?: boolean;
  typographer?: boolean;
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
      typeof value === 'string' &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function applyHeadingIds(md: MarkdownExit): void {
  const headingOpenRule = md.renderer.rules.heading_open;
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const nextToken = tokens[idx + 1];
    if (nextToken && nextToken.type === 'inline') {
      const text =
        nextToken.children
          ?.filter(t => t.type === 'text' || t.type === 'code_inline')
          .map(t => t.content)
          .join('') || '';
      token.attrSet('id', slugify(text));
    }
    if (headingOpenRule) {
      return headingOpenRule(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };
}

function createInstance(options: MarkdownOptions): MarkdownExit {
  const md = createMarkdownExit({
    html: options.html ?? false,
    linkify: options.linkify ?? true,
    breaks: options.breaks ?? false,
    typographer: options.typographer ?? false,
    highlight: options.highlighter
      ? (str: string, lang: string) => {
          const result = options.highlighter!(str.trimEnd(), lang);
          if (result.startsWith('<pre')) return result;
          return `<pre><code class="language-${lang}">${result}</code></pre>`;
        }
      : undefined
  });

  if (options.headingIds !== false) {
    applyHeadingIds(md);
  }

  return md;
}

export function markdownToHtml(markdown: string, options: MarkdownOptions = {}): string {
  const md = createInstance(options);
  return md.render(markdown).trim();
}

export function extractHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const md = createMarkdownExit({ html: false });
  const tokens = md.parse(markdown, {});

  function walkTokenList(tokenList: any[]) {
    for (let i = 0; i < tokenList.length; i++) {
      const token = tokenList[i];
      if (token.type === 'heading_open') {
        const level = parseInt(token.tag.slice(1), 10);
        const inlineToken = tokenList[i + 1];
        if (inlineToken && inlineToken.type === 'inline') {
          const text = extractTextFromTokens(inlineToken.children || []);
          headings.push({ level, text, id: slugify(text) });
        }
      }
      if (token.children) {
        walkTokenList(token.children);
      }
    }
  }

  walkTokenList(tokens);
  return headings;
}

function extractTextFromTokens(tokens: any[]): string {
  let text = '';
  for (const token of tokens) {
    if (token.type === 'text' || token.type === 'code_inline') {
      text += token.content;
    } else if (token.children) {
      text += extractTextFromTokens(token.children);
    }
  }
  return text;
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
