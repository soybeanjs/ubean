// @ubean/docs — build:api script.
// Runs TypeDoc over the curated subset of ubean packages' built dist/*.d.ts
// and emits apps/docs/public/api/<pkg>.json for the <ApiTable> renderer.
//
// Per DESIGN.md D4/D5/D6:
//  - Curated subset (7): ubean, @ubean/runtime, @ubean/routing, @ubean/config,
//    @ubean/auth, @ubean/ui, @ubean/pinia.
//  - Reads BUILT dist/*.d.ts (run `pnpm build` at repo root first).
//  - Per-package failure does NOT abort the build; a stub JSON is emitted so
//    the app renders gracefully (ApiTable shows "no entries").
//
// Usage: node scripts/build-api.mjs [--packages-root <path>]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(APP_ROOT, 'public/api');

// Map: output file → package name + dist path. `pkg` is the public name used
// in the route /reference/api/<pkg>; `distDir` is where its built .d.ts lives.
const PACKAGES_ROOT = resolve(APP_ROOT, '../../packages');
const CURATED = [
  { pkg: 'ubean', distDir: resolve(PACKAGES_ROOT, 'ubean/dist') },
  { pkg: 'runtime', distDir: resolve(PACKAGES_ROOT, 'runtime/dist') },
  { pkg: 'routing', distDir: resolve(PACKAGES_ROOT, 'routing/dist') },
  { pkg: 'config', distDir: resolve(PACKAGES_ROOT, 'config/dist') },
  { pkg: 'auth', distDir: resolve(PACKAGES_ROOT, 'auth/dist') },
  { pkg: 'ui', distDir: resolve(PACKAGES_ROOT, 'ui/dist') },
  { pkg: 'pinia', distDir: resolve(PACKAGES_ROOT, 'pinia/dist') }
];

function emitStub(outPath, pkgName, reason) {
  const stub = {
    name: pkgName,
    generatedAt: new Date().toISOString(),
    stub: true,
    reason,
    entries: []
  };
  writeFileSync(outPath, `${JSON.stringify(stub, null, 2)}\n`, 'utf8');
  console.warn(`[build:api] stub emitted for "${pkgName}": ${reason}`);
}

function runTypeDoc(entryPoint, outPath, pkgName) {
  // Use the typedoc CLI shipped as a devDependency. JSON output, no HTML.
  const args = [
    'typedoc',
    '--json', outPath,
    '--entryPoints', entryPoint,
    '--entryPointStrategy', 'expand',
    '--tsconfig', resolve(PACKAGES_ROOT, '../tsconfig.json'),
    '--logLevel', 'Error',
    '--excludePrivate',
    '--excludeInternal',
    '--readme', 'none'
  ];
  const result = spawnSync('npx', args, { encoding: 'utf8', cwd: APP_ROOT });
  if (result.status !== 0) {
    emitStub(outPath, pkgName, `typedoc exit ${result.status}: ${(result.stderr || '').split('\n')[0]}`);
  } else {
    console.log(`[build:api] generated ${pkgName} → ${outPath.replace(APP_ROOT + '/', '')}`);
  }
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  let built = 0;
  let stubs = 0;
  for (const { pkg, distDir } of CURATED) {
    const outPath = resolve(OUT_DIR, `${pkg}.json`);
    const entry = resolve(distDir, 'index.d.ts');

    if (!existsSync(entry)) {
      emitStub(outPath, pkg, `dist not built (run "pnpm build" at repo root) — ${entry} missing`);
      stubs++;
      continue;
    }
    try {
      runTypeDoc(entry, outPath, pkg);
      built++;
    } catch (err) {
      emitStub(outPath, pkg, `unexpected error: ${err.message}`);
      stubs++;
    }
  }

  console.log(`[build:api] done — ${built} generated, ${stubs} stubs.`);
}

main();
