import type { Context } from 'hono';

export function isHtmlResponse(c: Context): boolean {
  const contentType = c.res.headers.get('content-type') || '';
  return contentType.includes('text/html');
}

export function injectScript(html: string, script: string): string {
  const bodyCloseIndex = Math.max(html.lastIndexOf('</body>'), html.lastIndexOf('</BODY>'));
  if (bodyCloseIndex === -1) {
    return `${html}<script>${script}</script>`;
  }
  return `${html.slice(0, bodyCloseIndex)}<script>${script}</script>${html.slice(bodyCloseIndex)}`;
}
