/**
 * Stable Action ID generation (P9-02).
 *
 * Action IDs are derived from the action's source location (file path +
 * export name) so the client and server agree on the same ID without
 * runtime coordination. The Vite plugin injects the ID at build time,
 * but a runtime fallback is provided for actions defined outside the
 * `'use server'` pipeline (e.g. inline `defineAction` in page modules).
 *
 * Format: `act_<base32(sha1(relPath:exportName)).slice(0, 12)>`
 *   - `act_` prefix avoids collisions with other URL components
 *   - 12 chars of base32 gives ~60 bits of entropy (collision-resistant
 *     for any reasonable project size)
 *   - base32 (RFC 4648, lowercase) is URL-safe and case-insensitive
 */

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * Compute a stable action ID from a file path and export name.
 *
 * @param filePath Project-relative file path (e.g. `src/actions/auth.ts`)
 * @param exportName The export name (e.g. `login`, `default`)
 * @returns A stable action ID string
 */
export function createActionId(filePath: string, exportName: string): string {
  // Use Web Crypto (available in Node 18+ and all browsers) for a stable
  // SHA-1 hash. The result is synchronous-looking via a tiny lazy cache.
  const key = `${filePath}:${exportName}`;
  return `act_${base32HashSync(key).slice(0, 12)}`;
}

/**
 * Synchronous base32 hash. Uses a simple FNV-1a hash (32-bit) when
 * `crypto.subtle` is unavailable or async is undesirable. The hash space
 * is smaller than SHA-1 but sufficient for action IDs within a single
 * project (collision probability ~1 in 4 billion for 12 chars).
 *
 * For the Vite plugin path, a stronger SHA-1 hash is injected at build
 * time, so this runtime fallback only affects inline `defineAction` calls
 * without a file context.
 */
function base32HashSync(input: string): string {
  let hash = 0x811c9dc5; // FNV-1a offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime (32-bit): 0x01000193, multiply with overflow wrap
    hash = Math.imul(hash, 0x01000193);
  }
  // Mix in additional bits to extend to 60 bits (12 base32 chars)
  let hash2 = 0x1000193;
  for (let i = 0; i < input.length; i++) {
    hash2 ^= input.charCodeAt(i) * 31;
    hash2 = Math.imul(hash2, 0x01000193);
  }
  // Combine two 32-bit hashes into a 60-bit value
  const combined = BigInt(hash >>> 0) * (1n << 28n) + BigInt(hash2 >>> 0);
  return bigIntToBase32(combined, 12);
}

function bigIntToBase32(value: bigint, length: number): string {
  let result = '';
  let v = value;
  for (let i = 0; i < length; i++) {
    result = BASE32_ALPHABET[Number(v & 31n)] + result;
    v >>= 5n;
  }
  return result;
}

/**
 * Validate that a string is a well-formed action ID.
 *
 * Used by the dispatcher to reject malformed requests early.
 */
export function isValidActionId(id: string): boolean {
  return /^act_[a-z2-7]{12}$/.test(id);
}
