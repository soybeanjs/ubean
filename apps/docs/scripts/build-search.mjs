// @ubean/docs — build:search script.
// Walks src/content/{en,zh}/**/*.md + public/api/*.json and emits
// public/search-index.json for the client-side fuse.js search.
//
// Per DESIGN.md D10:
//  - Static-host friendly (no server runtime).
//  - Index shape matches SearchEntry in src/composables/use-doc-search.ts.
//  - Runs as a pre-build step (before `ubean build` so the file is copied
//    to dist/public/ during prerender).
//
// Usage: node scripts/build-search.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const CONTENT_DIR = resolve(APP_ROOT, 'src/content');
const API_DIR = resolve(APP_ROOT, 'public/api');
const OUT_FILE = resolve(APP_ROOT, 'public/search-index.json');

/**
 * @typedef {{ route: string, locale: 'en'|'zh', title: string, section: string, headings?: string[], bodyExcerpt?: string }} SearchEntry
 */

/** Parse YAML-like frontmatter (simple: key: value pairs between --- fences). */
function parseFrontmatter(raw) {
  const fm = {};
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { fm, body: raw };
  const block = m[1];
  for (const line of block.split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { fm, body: raw.slice(m[0].length) };
}

/** Extract headings (## and ###) from markdown body. */
function extractHeadings(body) {
  const headings = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (m) {
      const text = m[2].replace(/[`*_~]/g, '').trim();
      const id = text.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
      headings.push(text);
    }
  }
  return headings;
}

/** Strip markdown syntax for a readable body excerpt. */
function makeBodyExcerpt(body, maxLen = 300) {
  // Remove frontmatter (already stripped), code blocks, images, links, emphasis.
  let text = body
    .replace(/```[\s\S]*?```/g, '')       // code blocks
    .replace(/`[^`]+`/g, '')               // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/[#>*_~|-]/g, ' ')            // markdown syntax chars
    .replace(/\n{3,}/g, '\n\n')            // collapse newlines
    .replace(/\s+/g, ' ')                   // collapse whitespace
    .trim();
  if (text.length > maxLen) text = text.slice(0, maxLen) + '…';
  return text;
}

/** Recursively collect all .md files under a directory. */
function walkMd(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMd(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

/** Convert a content file path to its route. */
function filePathToRoute(absPath) {
  // src/content/en/guide/quickstart.md → /guide/quickstart
  // src/content/zh/architecture/overview.md → /zh/architecture/overview
  // src/content/en/index.md → /
  const rel = relative(CONTENT_DIR, absPath).replace(/\\/g, '/');
  const m = rel.match(/^(en|zh)\/(.*)\.md$/);
  if (!m) return null;
  const locale = m[1];
  let slug = m[2];
  if (slug === 'index') slug = '';
  const route = locale === 'zh' ? `/zh/${slug}` : `/${slug}`;
  return { route, locale, slug, section: slug.split('/')[0] || 'home' };
}

/** Collect search entries from markdown content. */
function collectMdEntries() {
  const entries = [];
  const files = walkMd(CONTENT_DIR);
  for (const file of files) {
    const meta = filePathToRoute(file);
    if (!meta) continue;
    const raw = readFileSync(file, 'utf8');
    const { fm, body } = parseFrontmatter(raw);
    const headings = extractHeadings(body);
    const title = fm.title || headings[0] || meta.slug.split('/').pop() || 'Untitled';
    const bodyExcerpt = makeBodyExcerpt(body);
    entries.push({
      route: meta.route,
      locale: meta.locale,
      title,
      section: meta.section,
      headings: headings.length ? headings : undefined,
      bodyExcerpt
    });
  }
  return entries;
}

/** Collect search entries from API JSON files. */
function collectApiEntries() {
  const entries = [];
  if (!existsSync(API_DIR)) return entries;
  for (const file of readdirSync(API_DIR)) {
    if (!file.endsWith('.json')) continue;
    const pkg = file.replace(/\.json$/, '');
    try {
      const data = JSON.parse(readFileSync(resolve(API_DIR, file), 'utf8'));
      const title = `@ubean/${pkg}`;
      const section = 'reference';
      const headings = (data.entries || []).map(e => e.name).filter(Boolean);
      const bodyExcerpt = data.stub
        ? `API reference for ${title}. ${data.reason || 'Stub — not yet generated.'}`
        : `API reference for ${title}. ${(data.entries || []).length} entries.`;
      entries.push({
        route: `/reference/api/${pkg}`,
        locale: 'en',
        title,
        section,
        headings: headings.length ? headings : undefined,
        bodyExcerpt
      });
    } catch {
      // skip malformed JSON
    }
  }
  return entries;
}

function main() {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const mdEntries = collectMdEntries();
  const apiEntries = collectApiEntries();
  const entries = [...mdEntries, ...apiEntries];
  writeFileSync(OUT_FILE, JSON.stringify(entries, null, 2), 'utf8');
  console.log(`[build:search] wrote ${entries.length} entries → ${relative(APP_ROOT, OUT_FILE)}`);
}

main();
