/**
 * Base64-encode a UTF-8 string for embedding in an HTML attribute.
 *
 * Fence code is transported to `<CopyButton>` this way because the code can
 * contain quotes, angle brackets and newlines that would break an attribute.
 * `btoa` alone is not enough: it throws on any code point above U+00FF, and the
 * docs routinely contain CJK prose inside templates.
 */
export function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/** Inverse of {@link encodeBase64Utf8}, used by `<CopyButton>` at copy time. */
export function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}
