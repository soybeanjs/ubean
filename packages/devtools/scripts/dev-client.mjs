import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..'); // packages/devtools

/**
 * Dev server for the DevTools iframe SPA.
 *
 * Uses Vite's programmatic API rather than the `vite` CLI: this workspace pins
 * `vite` to the `vite-plus-core` catalog entry, which ships no `bin`, so
 * `vite client --config ...` would fail with `vite: command not found`.
 * `scripts/build-client.mjs` already uses the programmatic `build()` for the
 * same reason.
 */
const server = await createServer({
  configFile: resolve(root, 'client/vite.config.ts'),
  logLevel: 'info'
});

await server.listen();
server.printUrls();
