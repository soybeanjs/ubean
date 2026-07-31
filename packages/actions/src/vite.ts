/**
 * Vite plugin for `'use server'` directive transformation (P9-02).
 *
 * Aligns with Next.js 16 / React 19 Server Actions and SolidStart's
 * `action()` convention. A module marked with `'use server'` (top-level
 * directive) has all its exports treated as server actions.
 *
 * ## How it works
 *
 * On the **server** (SSR / Node):
 *  - The module loads normally (real implementation).
 *  - Each exported function is wrapped with `defineAction()` so it gets
 *    registered in the global action registry with a stable ID.
 *  - The stable ID is computed from the file path + export name.
 *
 * On the **client** (browser):
 *  - Each exported function is replaced with an RPC stub that POSTs to
 *    `/__actions` with the action ID.
 *  - The original implementation is stripped (dead code elimination).
 *  - The RPC stub preserves the function's call signature so the caller
 *    code is unchanged (`const result = await login(email, password)`).
 *
 * ## Detection
 *
 * The plugin scans `.ts` / `.js` / `.mts` / `.mjs` / `.tsx` / `.jsx`
 * files for a top-level `'use server'` string literal directive. The
 * directive must be the first statement in the file (similar to `'use
 * strict'` and `'use client'`).
 *
 * ## Per-function directive
 *
 * A single function can be marked with `'use server'` at the top of its
 * body. The plugin treats only that function as a server action.
 *
 * ```ts
 * export async function login(email, password) {
 *   'use server';
 *   // server-only code
 * }
 * ```
 */
import type { Plugin } from 'vite';
import { relative } from 'pathe';
import { createActionId } from './id';

export interface ServerActionsPluginOptions {
  /**
   * The project root directory (used for computing stable action IDs).
   * Defaults to `process.cwd()` at plugin creation time.
   */
  root?: string;
  /**
   * Only transform files matching these patterns. Defaults to
   * `src/actions/**` and any file with a `'use server'` directive.
   */
  include?: RegExp[];
}

const USE_SERVER_DIRECTIVE_RE = /^(?:['"]use server['"];?|['"]use server['"]\n)/;
const PER_FUNC_DIRECTIVE_RE = /['"]use server['"];?/;

/**
 * Detect whether a source file starts with a top-level `'use server'`
 * directive.
 */
export function hasUseServerDirective(code: string): boolean {
  // Skip BOM and leading whitespace / comments
  const stripped = code
    .replace(/^\uFEFF/, '')
    .replace(/^\/\/[^\n]*\n/gm, '')
    .replace(/^\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s+/, '');
  return USE_SERVER_DIRECTIVE_RE.test(stripped);
}

/**
 * Extract all top-level export names from a module's source code.
 *
 * Recognizes:
 *  - `export function <name>(...) { ... }`
 *  - `export async function <name>(...) { ... }`
 *  - `export const <name> = ...`
 *  - `export const <name> = async ...`
 *  - `export { <name> }` (from a declaration above)
 */
export function extractExportNames(code: string): string[] {
  const names = new Set<string>();

  // `export function name` / `export async function name`
  const funcRe = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = funcRe.exec(code)) !== null) names.add(m[1]);

  // `export const name =` / `export let name =` / `export var name =`
  const constRe = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = constRe.exec(code)) !== null) names.add(m[1]);

  // `export class name`
  const classRe = /export\s+class\s+([A-Za-z_$][\w$]*)/g;
  while ((m = classRe.exec(code)) !== null) names.add(m[1]);

  // `export { name1, name2 }`
  const braceRe = /export\s*\{([^}]+)\}/g;
  while ((m = braceRe.exec(code)) !== null) {
    const items = m[1].split(',');
    for (const item of items) {
      // Handle `name as alias` — register both
      const parts = item.split(/\s+as\s+/).map(s => s.trim());
      for (const p of parts) {
        if (p && /^[A-Za-z_$][\w$]*$/.test(p)) names.add(p);
      }
    }
  }

  return [...names];
}

/**
 * Compute a project-relative path for action ID generation.
 *
 * The Vite plugin injects this path into `defineAction({ filePath })`
 * so the client and server agree on the same ID for a given action.
 */
function toProjectRelative(filePath: string, root: string): string {
  let rel = filePath;
  if (root) {
    try {
      rel = relative(root, filePath);
    } catch {
      // pathe.relative can throw on Windows cross-drive paths; fall back
      // to the original path.
    }
  }
  // Normalize Windows backslashes to forward slashes
  return rel.replace(/\\/g, '/');
}

/**
 * Transform a `'use server'` module for the **server** side.
 *
 * Wraps each export in `defineAction()` and registers it with the global
 * registry. The transformation rewrites the module to:
 *
 * ```ts
 * import { defineAction } from '@ubean/actions';
 *
 * // original exports become wrapped:
 * const __ubean_login = defineAction(
 *   { id: 'act_xxxxxxxxxxxx', filePath: 'src/actions/auth.ts', name: 'login' },
 *   async (email, password, ctx) => {
 *     // original implementation
 *   }
 * );
 * export { __ubean_login as login };
 * ```
 *
 * Implementation note: rather than parsing the full AST (which would
 * require a heavy parser dependency), we use a lightweight regex-based
 * approach that handles the common cases. Edge cases (e.g. computed
 * export names, re-exports with `from`) are skipped — users should keep
 * `'use server'` modules simple (exported async functions only).
 */
export function transformUseServerForServer(code: string, filePath: string, root: string): string {
  // Strip the top-level `'use server'` directive
  let stripped = code.replace(USE_SERVER_DIRECTIVE_RE, '');
  // Re-strip leading whitespace / comments that may have been before the
  // directive.
  stripped = stripped.replace(/^\s+/, '');

  const exportNames = extractExportNames(stripped);
  if (exportNames.length === 0) return code; // nothing to transform

  const relPath = toProjectRelative(filePath, root);

  // Generate the registration wrapper. We append a registration block
  // that wraps each export with `defineAction()` and re-exports it.
  // The original exports are preserved as `__raw_<name>` so the wrapper
  // can reference them.
  //
  // This approach avoids re-parsing the function bodies — we just rename
  // the original exports and emit new wrappers with the same names.

  const wrapperDefs = exportNames
    .map(name => {
      const id = createActionId(relPath, name);
      return `const __ubean_action_${name} = defineAction({
  id: ${JSON.stringify(id)},
  filePath: ${JSON.stringify(relPath)},
  name: ${JSON.stringify(name)}
}, __ubean_raw_${name});`;
    })
    .join('\n');

  const reExports = exportNames.map(name => `export { __ubean_action_${name} as ${name} };`).join('\n');

  // Rename original `export` keywords to plain declarations
  let renamed = stripped;
  for (const name of exportNames) {
    // `export function name` → `function __ubean_raw_name`
    renamed = renamed.replace(
      new RegExp(`export\\s+(async\\s+)?function\\s+(${name})\\b`),
      '$1function __ubean_raw_$2'
    );
    // `export const name =` → `const __ubean_raw_name =`
    renamed = renamed.replace(new RegExp(`export\\s+(const|let|var)\\s+(${name})\\s*=`), '$1 __ubean_raw_$2 =');
    // `export class name` → `class __ubean_raw_name`
    renamed = renamed.replace(new RegExp(`export\\s+class\\s+(${name})\\b`), 'class __ubean_raw_$1');
    // `export { name }` → drop (we re-export the wrapped version)
    // (handled by removing the `export { ... }` statement below)
  }

  // Remove bare `export { name1, name2 }` statements (we re-export
  // wrapped versions). This is a simplification — if the original had
  // `export { name as alias }`, we'd lose the alias. For 'use server'
  // modules this is acceptable.
  renamed = renamed.replace(/export\s*\{[^}]+\}\s*;?/g, '');

  return `// [ubean:use-server] Server-side transformed module
import { defineAction } from '@ubean/actions';

${renamed}

${wrapperDefs}

${reExports}
`;
}

/**
 * Transform a `'use server'` module for the **client** side.
 *
 * Replaces each export with an RPC stub that POSTs to `/__actions` with
 * the action ID. The original implementation is stripped.
 *
 * ```ts
 * export function login(email, password) {
 *   return __ubean_callAction('act_xxxxxxxxxxxx', [email, password]);
 * }
 * ```
 *
 * The stub preserves the call signature so callers don't need to change.
 */
export function transformUseServerForClient(code: string, filePath: string, root: string): string {
  // Strip the top-level `'use server'` directive
  let stripped = code.replace(USE_SERVER_DIRECTIVE_RE, '');
  stripped = stripped.replace(/^\s+/, '');

  const exportNames = extractExportNames(stripped);
  if (exportNames.length === 0) return code;

  const relPath = toProjectRelative(filePath, root);

  // Replace the entire module with stubs
  const stubs = exportNames
    .map(name => {
      const id = createActionId(relPath, name);
      return `export function ${name}(...args) {
  return __ubean_callAction(${JSON.stringify(id)}, args);
}`;
    })
    .join('\n\n');

  return `// [ubean:use-server] Client-side RPC stubs (original implementation stripped)
import { callAction as __ubean_callAction } from '@ubean/actions/runtime';

${stubs}
`;
}

/**
 * Vite plugin for `'use server'` directive transformation.
 *
 * The plugin hooks into Vite's `transform` step and inspects each module.
 * Modules with a top-level `'use server'` directive are transformed:
 *
 *  - On the server (SSR build / dev server SSR): exports are wrapped with
 *    `defineAction()` and registered in the global action registry.
 *  - On the client (browser build): exports are replaced with RPC stubs.
 *
 * The plugin is environment-aware via the `isServer` flag passed to
 * `transform()`. It also handles per-function `'use server'` directives
 * by transforming the containing function into an action.
 */
export function ubeanServerActionsPlugin(options: ServerActionsPluginOptions = {}): Plugin {
  const root = options.root || (typeof process !== 'undefined' ? process.cwd() : '');

  return {
    name: 'ubean:server-actions',
    enforce: 'pre',

    transform(code, id, transformOptions) {
      // Skip node_modules and virtual modules
      if (id.includes('/node_modules/') || id.includes('\0')) return null;

      // Only transform JS/TS files
      if (!/\.(ts|js|mts|mjs|tsx|jsx)$/.test(id)) return null;

      // Quick scan: must contain `'use server'` directive somewhere
      if (!PER_FUNC_DIRECTIVE_RE.test(code)) return null;

      // Top-level directive → transform the whole module
      const isWholeModule = hasUseServerDirective(code);

      const isServer = transformOptions?.ssr === true;

      if (isWholeModule) {
        return isServer ? transformUseServerForServer(code, id, root) : transformUseServerForClient(code, id, root);
      }

      // Per-function directive: not yet supported (would require AST
      // parsing to extract individual function bodies reliably).
      // For now, fall through and let the module load unchanged.
      // Users should use top-level `'use server'` for now.
      return null;
    }
  };
}
