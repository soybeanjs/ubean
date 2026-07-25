import type { Plugin, ResolvedConfig as ViteResolvedConfig } from 'vite';

export type ClientDirective = 'client:load' | 'client:idle' | 'client:visible' | 'client:media' | 'client:only';

const CLIENT_DIRECTIVES: ClientDirective[] = [
  'client:load',
  'client:idle',
  'client:visible',
  'client:media',
  'client:only'
];

const DIRECTIVE_RE = /\bclient:(load|idle|visible|media|only)\b/;

function isVueSfc(id: string): boolean {
  return /\.vue(?:\?.*)?$/.test(id) && !id.includes('&type=');
}

function extractTemplateBlock(
  code: string
): { start: number; end: number; content: string; attrs: string; openTagEnd: number } | null {
  const openMatch = code.match(/<template([^>]*)>/);
  if (!openMatch) return null;
  const openTagEnd = openMatch.index! + openMatch[0].length;
  const closeTag = '</template>';
  const closeIdx = code.indexOf(closeTag, openTagEnd);
  if (closeIdx === -1) return null;
  return {
    start: openMatch.index!,
    end: closeIdx + closeTag.length,
    content: code.slice(openTagEnd, closeIdx),
    attrs: openMatch[1] || '',
    openTagEnd
  };
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

interface TagMatch {
  tagName: string;
  fullOpenTag: string;
  selfClosing: boolean;
  attrs: Map<string, string | true>;
  attrsStr: string;
  start: number;
  openTagEnd: number;
  end: number;
  innerHTML: string;
}

function findTagAt(template: string, pos: number): TagMatch | null {
  const lt = template.indexOf('<', pos);
  if (lt === -1 || lt !== pos) return null;
  if (template[lt + 1] === '/' || template[lt + 1] === '!' || template[lt + 1] === '?') return null;

  const nameMatch = template.slice(lt + 1).match(/^([A-Z][A-Za-z0-9._-]*)/);
  if (!nameMatch) return null;
  const tagName = nameMatch[1];

  const gt = findClosingAngleBracket(template, lt + 1 + tagName.length);
  if (gt === -1) return null;

  const openTagContent = template.slice(lt, gt + 1);
  const selfClosing = template[gt - 1] === '/';
  const attrsStr = template.slice(lt + 1 + tagName.length, selfClosing ? gt - 1 : gt).trim();
  const attrs = parseAttrs(attrsStr);
  const openTagEnd = gt + 1;

  let end = openTagEnd;
  let innerHTML = '';

  if (!selfClosing) {
    const closeTag = `</${tagName}>`;
    const closePos = findMatchingClose(template, lt, tagName);
    if (closePos === -1) return null;
    innerHTML = template.slice(openTagEnd, closePos);
    end = closePos + closeTag.length;
  }

  return {
    tagName,
    fullOpenTag: openTagContent,
    selfClosing,
    attrs,
    attrsStr,
    start: lt,
    openTagEnd,
    end,
    innerHTML
  };
}

function findClosingAngleBracket(str: string, start: number): number {
  let inQuote: string | null = null;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (inQuote) {
      if (ch === inQuote && str[i - 1] !== '\\') inQuote = null;
    } else {
      if (ch === '"' || ch === "'") inQuote = ch;
      else if (ch === '>') return i;
    }
  }
  return -1;
}

function findMatchingClose(template: string, openLt: number, tagName: string): number {
  const openRe = new RegExp(`<${tagName}[\\s/>]`, 'g');
  const closeRe = new RegExp(`</${tagName}>`, 'g');
  openRe.lastIndex = openLt + 1;
  closeRe.lastIndex = openLt + 1;
  let depth = 1;

  while (depth > 0) {
    const nextOpen = openRe.exec(template);
    const nextClose = closeRe.exec(template);

    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      closeRe.lastIndex = nextOpen.index + tagName.length + 2;
    } else {
      depth--;
      if (depth === 0) return nextClose.index;
      openRe.lastIndex = nextClose.index + tagName.length + 3;
    }
  }
  return -1;
}

function parseAttrs(str: string): Map<string, string | true> {
  const map = new Map<string, string | true>();
  const re = /(?:^|\s)([:@a-zA-Z_][\w.:-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\{[^}]*\}|[^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const name = m[1];
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : true;
    map.set(name, val);
  }
  return map;
}

function collectStaticProps(attrs: Map<string, string | true>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, val] of attrs) {
    if (key.startsWith('client:')) continue;
    if (key.startsWith('v-') || key.startsWith('@') || key.startsWith(':')) continue;
    if (key === 'key' || key === 'ref') continue;
    if (val === true) {
      props[key] = true;
    } else {
      props[key] = val;
    }
  }
  return props;
}

function transformTemplate(template: string, islandCounter: { count: number }, filePath: string): string {
  let out = '';
  let pos = 0;

  while (pos < template.length) {
    const lt = template.indexOf('<', pos);
    if (lt === -1) {
      out += template.slice(pos);
      break;
    }
    out += template.slice(pos, lt);

    if (template[lt + 1] === '/' || template[lt + 1] === '!' || template[lt + 1] === '?') {
      out += template[lt];
      pos = lt + 1;
      continue;
    }

    const nameMatch = template.slice(lt + 1).match(/^([A-Z][A-Za-z0-9._-]*)/);
    if (!nameMatch) {
      const gt = findClosingAngleBracket(template, lt + 1);
      if (gt === -1) {
        out += template.slice(lt);
        break;
      }
      out += template.slice(lt, gt + 1);
      pos = gt + 1;
      continue;
    }

    const tag = findTagAt(template, lt);
    if (!tag) {
      out += template[lt];
      pos = lt + 1;
      continue;
    }

    const directive = CLIENT_DIRECTIVES.find(d => tag.attrs.has(d));
    if (!directive) {
      const inner = tag.selfClosing ? '' : transformTemplate(tag.innerHTML, islandCounter, filePath);
      out += tag.fullOpenTag;
      out += inner;
      if (!tag.selfClosing) out += `</${tag.tagName}>`;
      pos = tag.end;
      continue;
    }

    islandCounter.count++;
    const islandId = `island-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}-${islandCounter.count}`;

    const mediaRaw = tag.attrs.get('client:media');
    let mediaStr = '';
    if (directive === 'client:media' && mediaRaw && mediaRaw !== true) {
      const m = String(mediaRaw).replace(/^["']|["']$/g, '');
      mediaStr = ` data-media="${escapeAttr(m)}"`;
    }

    const props = collectStaticProps(tag.attrs);
    const propsJson = escapeAttr(JSON.stringify(props));

    out += `<ubean-island data-island-id="${islandId}" data-component="${tag.tagName}" data-directive="${directive}" data-props="${propsJson}"${mediaStr}>`;
    out += tag.selfClosing ? '' : tag.innerHTML;
    out += `</ubean-island>`;

    pos = tag.end;
  }

  return out;
}

export function transformVueSfcIslands(code: string, filePath: string): { code: string; islandCount: number } {
  const tpl = extractTemplateBlock(code);
  if (!tpl) return { code, islandCount: 0 };
  if (!DIRECTIVE_RE.test(tpl.content)) return { code, islandCount: 0 };

  const counter = { count: 0 };
  const newContent = transformTemplate(tpl.content, counter, filePath);
  const result = `${code.slice(0, tpl.start)}<template${tpl.attrs}>${newContent}</template>${code.slice(tpl.end)}`;
  return { code: result, islandCount: counter.count };
}

export interface UbeanIslandsPluginOptions {
  enabled?: boolean;
}

export function ubeanIslandsPlugin(_options: UbeanIslandsPluginOptions = {}): Plugin {
  let viteConfig: ViteResolvedConfig;
  let enabled = true;

  return {
    name: 'ubean:islands',
    enforce: 'pre',

    configResolved(config) {
      viteConfig = config;
      enabled = _options.enabled !== false;
    },

    transform(code, id) {
      if (!enabled) return null;
      if (!isVueSfc(id)) return null;
      if (!DIRECTIVE_RE.test(code)) return null;

      const filePath = id
        .split('?')[0]
        .replace(viteConfig.root, '')
        .replace(/^[/\\]/, '');
      return transformVueSfcIslands(code, filePath);
    }
  };
}
