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

/* -------------------------------------------------------------------------- */
/* Minimal YAML subset parser (indentation-aware)                              */
/*                                                                            */
/* Supports: nested maps, block sequences (`- item`, `- key: value` map        */
/* items), dotted keys (`a.b: v`), quoted strings, inline arrays, booleans,   */
/* null and numbers. Not supported: anchors, multi-line strings (`|`/`>`),    */
/* flow maps (`{}`).                                                          */
/* -------------------------------------------------------------------------- */

interface YamlLine {
  indent: number;
  content: string;
}

function tokenizeYaml(yaml: string): YamlLine[] {
  const lines: YamlLine[] = [];
  for (const raw of yaml.split('\n')) {
    const trimmed = raw.trimEnd();
    if (!trimmed.trim() || trimmed.trimStart().startsWith('#')) continue;
    let indent = 0;
    while (indent < trimmed.length && trimmed[indent] === ' ') indent++;
    lines.push({ indent, content: trimmed.trim() });
  }
  return lines;
}

function parseYamlScalar(raw: string): unknown {
  if (raw === 'true' || raw === 'false') return raw === 'true';
  if (raw === 'null' || raw === '~') return null;
  if (raw !== '' && !isNaN(Number(raw))) {
    const num = Number(raw);
    if (isFinite(num)) return num;
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
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
  return raw;
}

function isSequenceItem(content: string): boolean {
  return content === '-' || content.startsWith('- ');
}

/** `- key: value` starts an inline map item (continuation keys align after the dash). */
function isInlineMapStart(rest: string): boolean {
  const colonIdx = rest.indexOf(':');
  return colonIdx > 0 && (rest.length === colonIdx + 1 || rest[colonIdx + 1] === ' ');
}

function assignYamlKey(map: Record<string, unknown>, key: string, value: unknown): void {
  const nestedKeys = key.split('.');
  let current = map;
  for (let i = 0; i < nestedKeys.length - 1; i++) {
    const k = nestedKeys[i];
    if (typeof current[k] !== 'object' || current[k] === null) {
      current[k] = {};
    }
    current = current[k] as Record<string, unknown>;
  }
  current[nestedKeys[nestedKeys.length - 1]] = value;
}

function parseYamlBlock(lines: YamlLine[], start: number, indent: number): { value: unknown; next: number } {
  const first = lines[start];

  // Sequence block: `- item` / `- key: value` items at the same indent.
  if (isSequenceItem(first.content)) {
    const items: unknown[] = [];
    let i = start;
    while (i < lines.length && lines[i].indent === indent && isSequenceItem(lines[i].content)) {
      const rest = lines[i].content === '-' ? '' : lines[i].content.slice(2).trim();
      if (rest === '') {
        // `-` alone: value is the nested block below (or null).
        if (i + 1 < lines.length && lines[i + 1].indent > indent) {
          const res = parseYamlBlock(lines, i + 1, lines[i + 1].indent);
          items.push(res.value);
          i = res.next;
        } else {
          items.push(null);
          i += 1;
        }
      } else if (isInlineMapStart(rest)) {
        // `- key: value` — the first key of a map item. Continuation keys
        // align at `indent + 2` (right after the dash). Synthesize a sub
        // block where the dash line becomes a normal key line.
        const synthesized: YamlLine[] = [{ indent: indent + 2, content: rest }];
        let j = i + 1;
        while (j < lines.length && lines[j].indent > indent) {
          synthesized.push(lines[j]);
          j += 1;
        }
        const res = parseYamlBlock(synthesized, 0, indent + 2);
        items.push(res.value);
        i = j;
      } else {
        items.push(parseYamlScalar(rest));
        i += 1;
      }
    }
    return { value: items, next: i };
  }

  // Map block: `key: value` entries at the same indent.
  const map: Record<string, unknown> = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent && !isSequenceItem(lines[i].content)) {
    const colonIdx = lines[i].content.indexOf(':');
    if (colonIdx === -1) {
      i += 1;
      continue;
    }
    const key = lines[i].content.slice(0, colonIdx).trim();
    const rawValue = lines[i].content.slice(colonIdx + 1).trim();
    if (!key) {
      i += 1;
      continue;
    }
    if (rawValue === '') {
      if (i + 1 < lines.length && lines[i + 1].indent > indent) {
        // Nested map/sequence block below the key.
        const res = parseYamlBlock(lines, i + 1, lines[i + 1].indent);
        assignYamlKey(map, key, res.value);
        i = res.next;
      } else {
        // Bare `key:` with no children — kept as `true` for backward
        // compatibility with the previous flat parser.
        assignYamlKey(map, key, true);
        i += 1;
      }
    } else {
      assignYamlKey(map, key, parseYamlScalar(rawValue));
      i += 1;
    }
  }
  return { value: map, next: i };
}

function parseYamlSimple(yaml: string): MarkdownFrontmatter {
  const lines = tokenizeYaml(yaml);
  if (lines.length === 0) return {} as MarkdownFrontmatter;
  const { value } = parseYamlBlock(lines, 0, lines[0].indent);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {} as MarkdownFrontmatter;
  }
  return value as MarkdownFrontmatter;
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

// P9-20: MDX compilation
export { compileMdx, isMdxAvailable, isMdxAvailableSync, type MdxOptions, type MdxCompileResult } from './mdx';

export { ubeanMdxPlugin, type MdxVitePluginOptions } from './vite-plugin';
