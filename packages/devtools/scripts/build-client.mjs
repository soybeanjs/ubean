import { build } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..'); // packages/devtools

await build({
  configFile: resolve(root, 'client/vite.config.ts'),
  logLevel: 'warn'
});
