import { kebabCase } from 'scule';
import type {
  ContentDocument,
  ContentQueryBuilder,
  ContentBody,
  ContentTocItem,
  MarkdownNode,
  ContentNavigationItem,
  ParsedContentMeta,
  ContentSchema,
  ContentCollection
} from './types';

export function generateId(path: string, extension?: string): string {
  const cleanPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (extension) {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return `content:${cleanPath.replace(new RegExp(`${ext}$`), '')}`;
  }
  return `content:${cleanPath.replace(/\.[^.]+$/, '')}`;
}

export function getDirname(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function getBasename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

export function getExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

export function getStem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

export function normalizePath(path: string): string {
  return `/${path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/g, '/')}`;
}

export function pathToTitle(path: string): string {
  const stem = getStem(getBasename(path));
  if (stem === 'index') {
    return kebabCase(getBasename(getDirname(path)) || 'home')
      .split('-')
      .map(capitalize)
      .join(' ');
  }
  return kebabCase(stem).split('-').map(capitalize).join(' ');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function parseFrontmatter(content: string): { data: Record<string, any>; content: string } {
  const data: Record<string, any> = {};
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);

  if (!fmMatch) {
    return { data, content };
  }

  const [, frontmatterStr, body] = fmMatch;
  const lines = frontmatterStr.split('\n');
  let currentKey = '';
  let isArray = false;

  for (const line of lines) {
    const arrayItemMatch = line.match(/^\s*-\s*(.+)$/);
    if (arrayItemMatch && currentKey && isArray) {
      if (!Array.isArray(data[currentKey])) {
        data[currentKey] = [];
      }
      data[currentKey].push(parseValue(arrayItemMatch[1].trim()));
      continue;
    }

    const kvMatch = line.match(/^([\w.-]+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      currentKey = key;
      if (value.trim() === '') {
        isArray = true;
        data[key] = [];
      } else if (value.trim() === '[]') {
        isArray = false;
        data[key] = [];
      } else if (value.trim() === '{}') {
        isArray = false;
        data[key] = {};
      } else {
        isArray = false;
        data[key] = parseValue(value.trim());
      }
    }
  }

  return { data, content: body };
}

function parseValue(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === 'undefined') return undefined;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseMarkdown(content: string): ContentBody {
  const children: MarkdownNode[] = [];
  const lines = content.split('\n');
  const toc: ContentTocItem[] = [];
  let excerpt = '';
  let inCodeBlock = false;
  let codeContent = '';
  let paragraphLines: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      const text = paragraphLines.join(' ').trim();
      if (text) {
        children.push({
          type: 'element',
          tag: 'p',
          children: [{ type: 'text', value: text }]
        });
      }
      paragraphLines = [];
    }
  }

  let foundExcerptSeparator = false;
  let headingStack: ContentTocItem[][] = [toc];
  let headingDepths: number[] = [0];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushParagraph();
      if (inCodeBlock) {
        children.push({
          type: 'element',
          tag: 'pre',
          children: [{ type: 'element', tag: 'code', children: [{ type: 'text', value: codeContent }] }]
        });
        inCodeBlock = false;
        codeContent = '';
      } else {
        inCodeBlock = true;
        codeContent = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += (codeContent ? '\n' : '') + line;
      continue;
    }

    if (line.trim() === '<!-- more -->') {
      foundExcerptSeparator = true;
      if (paragraphLines.length > 0) {
        excerpt = paragraphLines.join(' ').trim();
      } else {
        const lastP = [...children].reverse().find(c => c.tag === 'p' && c.children?.[0]?.value);
        excerpt = lastP?.children?.[0]?.value || '';
      }
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const depth = headingMatch[1].length;
      const text = headingMatch[2].replace(/[#*_`~[\]]/g, '').trim();
      const id = kebabCase(text);

      while (headingDepths[headingDepths.length - 1] >= depth) {
        headingDepths.pop();
        headingStack.pop();
      }

      const item: ContentTocItem = { id, depth, text, children: [] };
      headingStack[headingStack.length - 1].push(item);
      headingStack.push(item.children);
      headingDepths.push(depth);

      children.push({
        type: 'element',
        tag: `h${depth}`,
        props: { id },
        children: [{ type: 'text', value: text }]
      });
      continue;
    }

    const listMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      const text = parseInlineMarkdown(listMatch[2].trim());
      children.push({
        type: 'element',
        tag: 'li',
        children: [{ type: 'text', value: text }]
      });
      continue;
    }

    const orderedListMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (orderedListMatch) {
      flushParagraph();
      const text = parseInlineMarkdown(orderedListMatch[2].trim());
      children.push({
        type: 'element',
        tag: 'li',
        children: [{ type: 'text', value: text }]
      });
      continue;
    }

    const hrMatch = line.match(/^[-*_]{3,}$/);
    if (hrMatch) {
      flushParagraph();
      children.push({ type: 'element', tag: 'hr' });
      continue;
    }

    const blockquoteMatch = line.match(/^>\s*(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      children.push({
        type: 'element',
        tag: 'blockquote',
        children: [{ type: 'text', value: blockquoteMatch[1].trim() }]
      });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();

  if (!foundExcerptSeparator && paragraphLines.length === 0 && children.length > 0) {
    const firstP = children.find(c => c.tag === 'p' && c.children?.[0]?.value);
    if (firstP?.children?.[0]?.value) {
      excerpt = firstP.children[0].value.slice(0, 200);
    }
  }

  return { type: 'root', children, toc, excerpt: excerpt || undefined };
}

function parseInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1');
}

export function createQueryBuilder(documents: ContentDocument[]): ContentQueryBuilder {
  let result = [...documents];
  const whereClauses: Array<(doc: ContentDocument) => boolean> = [];
  let sortFields: Array<{ field: string; direction: 'asc' | 'desc' }> = [];
  let limitCount: number | null = null;
  let skipCount = 0;
  let selectedFields: string[] | null = null;
  let excludedFields: string[] | null = null;

  const builder: ContentQueryBuilder = {
    where(fieldOrQuery: string | Record<string, any>, operator?: string, value?: any) {
      if (typeof fieldOrQuery === 'object') {
        for (const [key, val] of Object.entries(fieldOrQuery)) {
          whereClauses.push(doc => getNestedValue(doc, key) === val);
        }
      } else {
        const field = fieldOrQuery;
        let op = operator;
        let val = value;
        if (value === undefined && operator !== undefined) {
          op = '==';
          val = operator;
        }
        whereClauses.push(doc => {
          const docValue = getNestedValue(doc, field);
          switch (op) {
            case '=':
            case '==':
            case undefined:
              return docValue === val;
            case '!=':
              return docValue !== val;
            case '>':
              return docValue > val;
            case '>=':
              return docValue >= val;
            case '<':
              return docValue < val;
            case '<=':
              return docValue <= val;
            case 'contains':
              return String(docValue).includes(val);
            case 'in':
              return Array.isArray(val) && val.includes(docValue);
            case 'exists':
              return val ? docValue !== undefined : docValue === undefined;
            default:
              return docValue === val;
          }
        });
      }
      return builder;
    },
    sort(field: string, direction: 'asc' | 'desc' = 'asc') {
      sortFields.push({ field, direction });
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },
    skip(count: number) {
      skipCount = count;
      return builder;
    },
    only(fields: string[]) {
      selectedFields = fields;
      return builder;
    },
    without(fields: string[]) {
      excludedFields = fields;
      return builder;
    },
    async find() {
      applyWhere();
      applySort();
      applySkipLimit();
      return applyFieldSelection(result);
    },
    async findOne() {
      limitCount = 1;
      const results = await builder.find();
      return results[0] || null;
    },
    async findSurround(path: string, options: { before?: number; after?: number } = {}) {
      const before = options.before ?? 1;
      const after = options.after ?? 1;
      applyWhere();
      applySort();
      const index = result.findIndex(doc => doc._path === path);
      if (index === -1) return [];
      const start = Math.max(0, index - before);
      const end = Math.min(result.length, index + after + 1);
      return applyFieldSelection(result.slice(start, end).filter((_, i) => i !== before));
    },
    async count() {
      applyWhere();
      return result.length;
    }
  };

  function applyWhere() {
    result = result.filter(doc => whereClauses.every(clause => clause(doc)));
  }

  function applySort() {
    if (sortFields.length === 0) {
      sortFields = [{ field: '_path', direction: 'asc' }];
    }
    result.sort((a, b) => {
      for (const { field, direction } of sortFields) {
        const aVal = getNestedValue(a, field);
        const bVal = getNestedValue(b, field);
        if (aVal === bVal) continue;
        const cmp = aVal < bVal ? -1 : 1;
        return direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  function applySkipLimit() {
    if (skipCount > 0) {
      result = result.slice(skipCount);
    }
    if (limitCount !== null) {
      result = result.slice(0, limitCount);
    }
  }

  function applyFieldSelection(docs: ContentDocument[]): ContentDocument[] {
    if (!selectedFields && !excludedFields) return docs;
    return docs.map(doc => {
      const newDoc: ContentDocument = { ...doc };
      if (excludedFields) {
        for (const field of excludedFields) {
          delete (newDoc as any)[field];
        }
      }
      if (selectedFields) {
        const kept: any = {};
        for (const field of selectedFields) {
          kept[field] = (doc as any)[field];
        }
        kept._id = doc._id;
        kept._path = doc._path;
        return kept;
      }
      return newDoc;
    });
  }

  return builder;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, key) => o?.[key], obj);
}

export function buildNavigation(
  documents: ContentDocument[],
  _options: { fields?: string[] } = {}
): ContentNavigationItem[] {
  const tree: ContentNavigationItem[] = [];
  const map = new Map<string, ContentNavigationItem>();

  const docs = documents
    .filter(d => !d._draft && !d._partial && d.navigation !== false)
    .sort((a, b) => a._path.localeCompare(b._path));

  for (const doc of docs) {
    const item: ContentNavigationItem = {
      title: doc.title || pathToTitle(doc._file),
      path: doc._path,
      id: doc._id,
      draft: doc._draft
    };
    map.set(doc._path, item);
  }

  for (const doc of docs) {
    const item = map.get(doc._path)!;
    if (doc._path === '/') {
      tree.unshift(item);
      continue;
    }

    const parentPath = doc._dir;
    if (parentPath === '/') {
      tree.push(item);
      continue;
    }
    const parent = map.get(parentPath);
    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(item);
    } else {
      tree.push(item);
    }
  }

  return tree;
}

export function parseContent(raw: string, filePath: string, options: { type?: string } = {}): ContentDocument {
  const extension = getExtension(filePath);
  const type = (options.type || extensionToType(extension)) as any;
  const stem = getStem(getBasename(filePath));
  const isDraft = stem.startsWith('.') || filePath.includes('/.') || filePath.includes('_draft');
  const isPartial = stem.startsWith('_') || filePath.includes('_partial');

  let meta: ParsedContentMeta = {
    _id: generateId(filePath, extension),
    _path: normalizePath(`${getDirname(filePath)}/${stem === 'index' ? '' : stem}`),
    _file: getBasename(filePath),
    _dir: normalizePath(getDirname(filePath)),
    _draft: isDraft,
    _partial: isPartial,
    _type: type,
    _extension: extension,
    _empty: raw.trim().length === 0
  };

  let body: ContentBody | undefined;
  let extraMeta: Record<string, any> = {};

  if (type === 'markdown' || type === 'mdx') {
    const { data, content } = parseFrontmatter(raw);
    extraMeta = data;
    body = parseMarkdown(content);
    if (body.excerpt) extraMeta.description = extraMeta.description || body.excerpt;
  } else if (type === 'json') {
    try {
      extraMeta = JSON.parse(raw);
    } catch {
      extraMeta = {};
    }
  } else if (type === 'yaml' || type === 'yml') {
    extraMeta = parseSimpleYaml(raw);
  }

  return {
    ...meta,
    ...extraMeta,
    title: extraMeta.title || (meta._path === '/' ? 'Home' : pathToTitle(filePath)),
    body,
    _draft: extraMeta.draft || meta._draft,
    _partial: extraMeta.partial || meta._partial
  };
}

function extensionToType(ext: string): string {
  const map: Record<string, string> = {
    md: 'markdown',
    mdx: 'mdx',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    csv: 'csv',
    html: 'html',
    htm: 'html'
  };
  return map[ext] || 'markdown';
}

function parseSimpleYaml(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const kvMatch = line.match(/^([\w.-]+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      result[key] = parseValue(value.trim() || '');
    }
  }

  return result;
}

export function defineContentCollection(collection: {
  name: string;
  source: string;
  type?: any;
  schema?: ContentSchema;
  documents?: ContentDocument[];
}): ContentCollection {
  const docs = collection.documents || [];

  return {
    name: collection.name,
    source: collection.source,
    type: collection.type,
    schema: collection.schema,
    list: async () => docs,
    getItem: async (path: string) => docs.find(d => d._path === path) || null,
    query: () => createQueryBuilder(docs)
  };
}

export function createContentCollection(
  name: string,
  source: string,
  documents: ContentDocument[] = []
): ContentCollection {
  return defineContentCollection({ name, source, documents });
}
