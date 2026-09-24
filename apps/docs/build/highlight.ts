import { createHighlighter } from 'shiki';
import type { ThemeRegistration } from 'shiki';
import { encodeBase64Utf8 } from '../src/shared/encode';
import { SHIKI_LANGS, SHIKI_THEMES } from '../src/shared/shiki-config';

/** markdown-it `highlight` hook signature (`str`, `lang`, `attrs`). */
export type HighlightCode = (code: string, lang: string) => string;

/**
 * Creates the markdown-it `highlight` hook wired through `markdown.markdownExit`.
 *
 * ubean's `markdown.theme` config only records which theme pair the CSS should
 * expect — it does not itself install a highlighter, so fences would render as
 * plain `<pre><code>` without this hook. `codeToHtml` is sync once the
 * highlighter exists, so callers may top-level await this factory and then use
 * the returned hook synchronously.
 *
 * Runs in Node during SSG, so the bundled entry is fine here: its grammars and
 * themes are only ever loaded on the build side and never reach the client
 * bundle (see src/shared/highlight.ts for the browser-side counterpart).
 */
export async function createMarkdownHighlight(): Promise<HighlightCode> {
  const highlighter = await createHighlighter({
    themes: Object.values(SHIKI_THEMES) as unknown as ThemeRegistration[],
    langs: [...SHIKI_LANGS]
  });
  const loadedLanguages = highlighter.getLoadedLanguages();

  return (code, lang) => {
    const language = loadedLanguages.includes(lang) ? lang : 'text';
    const normalized = code.replace(/\n$/, '');

    const html = highlighter.codeToHtml(normalized, {
      lang: language,
      themes: SHIKI_THEMES,
      defaultColor: false
    });

    return wrapFenceWithCopyButton(html, lang, normalized);
  };
}

/**
 * Fence-level CopyButton injection. ubean only spreads `markdownExit` into the
 * MarkdownIt constructor and never forwards `setupMarkdown`, so a
 * `md.renderer.rules.fence` override is not available. markdown-exit renders a
 * `highlight()` result verbatim when it starts with `<pre`, so the panel wrapper
 * (`md-code-block` + `data-lang` badge) and the `<CopyButton>` usage are injected
 * here; `unplugin-vue-markdown` + component auto-import resolve `<CopyButton>`
 * when the `.md` is compiled into a Vue SFC.
 */
function wrapFenceWithCopyButton(shikiHtml: string, lang: string, code: string): string {
  const openTag = shikiHtml.match(/^<pre([^>]*)>/);

  if (!openTag) {
    return shikiHtml;
  }

  const attrs = openTag[1]
    .replace(/^ class="([^"]*)"/, ` class="$1 md-code-block" data-lang="${lang}"`)
    .replace(/ tabindex="0"/, '');

  const codeBase64 = encodeBase64Utf8(code);

  return `<pre${attrs}><CopyButton code-base64="${codeBase64}" />${shikiHtml.slice(openTag[0].length)}`;
}
