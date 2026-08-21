export function detectLocaleFromAcceptLanguage(
  header: string | undefined,
  locales: string[],
  fallback: string
): string {
  if (!header) return fallback;

  const requested = header
    .split(',')
    .map(lang => {
      const [code, q = 'q=1.0'] = lang.trim().split(';');
      const quality = parseFloat(q.replace('q=', '')) || 0;
      return { code: code.trim().toLowerCase(), quality };
    })
    .sort((a, b) => b.quality - a.quality);

  const lower = locales.map(l => ({ orig: l, lower: l.toLowerCase() }));

  for (const { code } of requested) {
    for (const loc of lower) {
      if (code === loc.lower || code.startsWith(`${loc.lower}-`)) {
        return loc.orig;
      }
    }
  }

  return fallback;
}

export function parseLocaleCookie(cookieHeader: string | undefined, cookieName: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function serializeLocaleCookie(cookieName: string, locale: string): string {
  return `${cookieName}=${encodeURIComponent(locale)}; Path=/; SameSite=Lax`;
}
