import type { PageHead } from '../pages/protocol';

const _global = globalThis as any;
type AnyEl = any;

function setAttrs(el: AnyEl, attrs: Record<string, string>) {
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
}

export function createHeadManager(initial?: PageHead) {
  const metaTags = new Map<string, AnyEl>();
  const linkTags = new Map<string, AnyEl>();
  let titleEl: AnyEl | null = null;

  function getDocument(): any {
    return _global.document;
  }

  function ensureTitle(): AnyEl {
    const doc = getDocument();
    if (!doc) return null as any;
    if (!titleEl) {
      titleEl = doc.createElement('title');
      doc.head.appendChild(titleEl);
    }
    return titleEl;
  }

  function ensureMeta(key: string, value: string): AnyEl {
    const id = `${key}=${value}`;
    let el = metaTags.get(id);
    const doc = getDocument();
    if (!doc) return null as any;
    if (!el) {
      el = doc.createElement('meta');
      el.setAttribute(key, value);
      doc.head.appendChild(el);
      metaTags.set(id, el);
    }
    return el;
  }

  function ensureLink(rel: string, href: string): AnyEl {
    const id = `${rel}:${href}`;
    let el = linkTags.get(id);
    const doc = getDocument();
    if (!doc) return null as any;
    if (!el) {
      el = doc.createElement('link');
      el.setAttribute('rel', rel);
      el.setAttribute('href', href);
      doc.head.appendChild(el);
      linkTags.set(id, el);
    }
    return el;
  }

  function apply(head: PageHead) {
    const doc = getDocument();
    if (!doc) return;

    if (head.title !== undefined) {
      const t = ensureTitle();
      if (t) t.textContent = head.title;
    }
    if (head.htmlAttrs) {
      setAttrs(doc.documentElement, head.htmlAttrs);
    }
    if (head.bodyAttrs) {
      setAttrs(doc.body, head.bodyAttrs);
    }
    if (head.meta) {
      for (const attrs of head.meta) {
        const key = attrs.name ? 'name' : attrs.property ? 'property' : attrs.charset ? 'charset' : 'http-equiv';
        const val = attrs[key] ?? '';
        const el = ensureMeta(key, val);
        if (el) {
          for (const [k, v] of Object.entries(attrs)) {
            if (k !== key) el.setAttribute(k, v);
          }
        }
      }
    }
    if (head.link) {
      for (const attrs of head.link) {
        const rel = attrs.rel ?? '';
        const href = attrs.href ?? '';
        if (!rel || !href) continue;
        const el = ensureLink(rel, href);
        if (el) {
          for (const [k, v] of Object.entries(attrs)) {
            if (k !== 'rel' && k !== 'href') el.setAttribute(k, v);
          }
        }
      }
    }
  }

  if (initial && typeof _global.document !== 'undefined') {
    apply(initial);
  }

  return { apply };
}
