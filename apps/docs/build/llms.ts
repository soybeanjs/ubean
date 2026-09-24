import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { resolveContentRoutePath, toPosixPath } from './docs-routes';

type DocFile = {
  description: string;
  routePath: string;
  title: string;
  value: string;
};

type FrontmatterResult = {
  content: string;
  data: Record<string, string>;
};

type LlmsOutput = {
  full: string;
  index: string;
  pages: Map<string, string>;
};

const llmOnlyRegex = /<llm-only>([\s\S]*?)<\/llm-only>/giu;
const llmExcludeRegex = /<llm-exclude>[\s\S]*?<\/llm-exclude>/giu;
const htmlCommentRegex = /<!--([\s\S]*?)-->/gu;
/** A whole standalone PascalCase tag on its own line (a doc demo component). */
const genericVueTagRegex = /^<\/?[A-Z][^>]*>$/gmu;
/** A fenced block, so its contents are never mistaken for live markup. */
const fencedBlockRegex = /^(`{3,}|~{3,})[\s\S]*?^\1\s*$/gmu;

/**
 * llms.txt generation for the ubean docs site.
 *
 * ubean registers `/sitemap.xml` and `/robots.txt` as runtime routes but excludes
 * them from prerender output, so the SEO/LLM artifacts are written post-build
 * instead. Route mapping is shared with prerender/sitemap via
 * `build/docs-routes.ts`, so a slug fix cannot desync the two.
 *
 * Dev: middleware answers `/llms.txt`, `/llms-full.txt`, and per-page `<route>.md`.
 * Build: `closeBundle` writes the outputs into `dist/public` (the ubean SSG root)
 * after the prerender phase has finished.
 */
export function docsLlmsPlugin(): Plugin {
  let config: ResolvedConfig | null = null;
  let isSsrBuild = false;

  return {
    name: 'ubean-docs-llms',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
      isSsrBuild = Boolean(resolvedConfig.build.ssr);
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!config) {
          next();
          return;
        }

        handleDevRequest(req, res, next, config);
      });
    },

    async closeBundle() {
      if (!config || isSsrBuild) {
        return;
      }

      const output = await createLlmsOutput(config.root);
      const outDir = path.resolve(config.root, 'dist/public');

      await writeLlmsOutput(outDir, output);
    }
  };
}

async function handleDevRequest(
  req: IncomingMessage & { url?: string },
  res: ServerResponse,
  next: () => void,
  config: ResolvedConfig
): Promise<void> {
  const requestPath = stripQuery(req.url ?? '');

  if (!requestPath.endsWith('.txt') && !requestPath.endsWith('.md')) {
    next();
    return;
  }

  const output = await createLlmsOutput(config.root);

  if (requestPath === '/llms.txt') {
    respondWithText(res, output.index);
    return;
  }

  if (requestPath === '/llms-full.txt') {
    respondWithText(res, output.full);
    return;
  }

  const page = output.pages.get(requestPath);

  if (page) {
    respondWithText(res, page);
    return;
  }

  next();
}

async function writeLlmsOutput(outDir: string, output: LlmsOutput): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outDir, 'llms.txt'), output.index, 'utf8'),
    writeFile(path.join(outDir, 'llms-full.txt'), output.full, 'utf8'),
    ...Array.from(output.pages.entries()).map(async ([pagePath, content]) => {
      const targetPath = path.join(outDir, pagePath.slice(1));

      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content, 'utf8');
    })
  ]);
}

async function createLlmsOutput(rootDir: string): Promise<LlmsOutput> {
  const docsDir = path.join(rootDir, 'src/content/en');
  const docPaths = await collectMarkdownFiles(docsDir);
  const docFiles = await Promise.all(docPaths.map(docPath => createDocFile(docsDir, docPath)));
  const sortedDocFiles = docFiles.sort((left, right) => left.routePath.localeCompare(right.routePath));
  const pages = new Map(sortedDocFiles.map(file => [`${file.routePath}.md`, createPageContent(file)]));

  return {
    full: createLlmsFull(sortedDocFiles),
    index: createLlmsIndex(sortedDocFiles),
    pages
  };
}

async function collectMarkdownFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedPaths = await Promise.all(
    entries.map(async entry => {
      const resolvedPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return collectMarkdownFiles(resolvedPath);
      }

      if (entry.isFile() && entry.name.endsWith('.md')) {
        return [resolvedPath];
      }

      return [];
    })
  );

  return nestedPaths.flat();
}

async function createDocFile(docsDir: string, filePath: string): Promise<DocFile> {
  const relativePath = toPosixPath(path.relative(docsDir, filePath));
  const rawContent = await readFile(filePath, 'utf8');
  const { content, data } = parseFrontmatter(rawContent);
  const normalizedContent = normalizeMarkdownContent(content);
  const title = data.title || extractTitle(normalizedContent) || humanizeTitle(relativePath);
  const description = data.description || extractDescription(normalizedContent);
  const routePath = resolveContentRoutePath(relativePath.replace(/\.md$/u, ''));

  return {
    description,
    routePath,
    title,
    value: normalizedContent
  };
}

function createLlmsIndex(docFiles: DocFile[]): string {
  const toc = docFiles.map(file => {
    const descriptionSuffix = file.description ? `: ${file.description}` : '';

    return `- [${file.title}](${file.routePath}.md)${descriptionSuffix}`;
  });

  return `${[
    '# ubean Docs',
    '',
    'English LLM-friendly documentation index for the ubean docs site.',
    '',
    '## Details',
    '',
    '- Generated from src/content/en for the ubean documentation site.',
    '- Mirrors the current docs routing model: one page per markdown file under src/content.',
    '- Markdown component placeholders are normalized into short textual hints for LLM consumption.',
    '',
    '## Table of Contents',
    '',
    ...toc
  ]
    .join('\n')
    .trimEnd()}\n`;
}

function createLlmsFull(docFiles: DocFile[]): string {
  const sections = docFiles.flatMap(file => [
    `## ${file.title}`,
    '',
    `- Page URL: ${file.routePath}`,
    `- Markdown URL: ${file.routePath}.md`,
    ...(file.description ? [`- Description: ${file.description}`] : []),
    '',
    file.value.trim(),
    ''
  ]);

  return `${['# ubean Docs', '', 'English LLM-friendly documentation bundle for the ubean docs site.', '', ...sections]
    .join('\n')
    .trimEnd()}\n`;
}

function createPageContent(file: DocFile): string {
  return [
    `# ${file.title}`,
    '',
    `Source URL: ${file.routePath}`,
    `Markdown URL: ${file.routePath}.md`,
    ...(file.description ? [`Description: ${file.description}`] : []),
    '',
    file.value.trim(),
    ''
  ].join('\n');
}

function parseFrontmatter(source: string): FrontmatterResult {
  if (!source.startsWith('---\n')) {
    return { content: source, data: {} };
  }

  const endIndex = source.indexOf('\n---\n', 4);

  if (endIndex < 0) {
    return { content: source, data: {} };
  }

  const rawFrontmatter = source.slice(4, endIndex).trim();
  const content = source.slice(endIndex + 5);
  const data = Object.fromEntries(
    rawFrontmatter
      .split('\n')
      .map(line => {
        const separatorIndex = line.indexOf(':');

        if (separatorIndex < 0) {
          return null;
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line
          .slice(separatorIndex + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');

        return key ? [key, value] : null;
      })
      .filter((entry): entry is [string, string] => entry !== null)
  );

  return { content, data };
}

/**
 * Placeholder marking a masked fenced block. A private-use code point is used
 * instead of a NUL sentinel: it cannot occur in real documentation prose, and it
 * keeps the masking regex free of control characters (banned by lint).
 */
const FENCE_SENTINEL = '\uE000';

/**
 * Strip the markup an LLM cannot use, but only *outside* fenced code blocks —
 * ubean's docs legitimately show Vue/HTML inside fences, and a blanket tag strip
 * would delete the very code the page is documenting.
 */
function normalizeMarkdownContent(source: string): string {
  const fences: string[] = [];
  const masked = source.replace(fencedBlockRegex, match => {
    fences.push(match);

    return `${FENCE_SENTINEL}${fences.length - 1}${FENCE_SENTINEL}`;
  });

  const normalized = masked
    .replace(htmlCommentRegex, '')
    .replace(llmExcludeRegex, '')
    .replace(llmOnlyRegex, '$1')
    .replace(/<ClientOnly\s*\/?>/gu, '')
    .replace(/<\/ClientOnly>/gu, '')
    .replace(genericVueTagRegex, '');

  const fencePattern = new RegExp(`${FENCE_SENTINEL}(\\d+)${FENCE_SENTINEL}`, 'gu');

  return normalized.replace(fencePattern, (_, index: string) => fences[Number(index)]).replace(/\n{3,}/g, '\n\n');
}

function extractTitle(source: string): string {
  const titleMatch = source.match(/^#\s+(.+)$/mu);

  return titleMatch?.[1]?.trim() ?? '';
}

function extractDescription(source: string): string {
  const lines = source.split('\n').map(line => line.trim());

  for (const line of lines) {
    if (!line) {
      continue;
    }

    if (line.startsWith('#') || line.startsWith('<') || line.startsWith('```') || line.startsWith('- ')) {
      continue;
    }

    return line;
  }

  return '';
}

function humanizeTitle(relativePath: string): string {
  const fileName = path.basename(relativePath, '.md');

  return fileName
    .split(/[-_]/u)
    .filter(Boolean)
    .map(segment => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ');
}

function stripQuery(url: string): string {
  return url.split('?')[0] || '/';
}

function respondWithText(res: ServerResponse, content: string): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(content);
}
