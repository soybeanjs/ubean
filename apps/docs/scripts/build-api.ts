// @ubean/docs — build:api script.
// Runs TypeDoc over the curated subset of ubean packages' built dist/*.d.ts and
// emits apps/docs/src/generated/api/<pkg>.json for the <ApiTable> renderer.
//
// Output lives under `src/` (not `public/`) so <ApiTable> can `import.meta.glob`
// it. A runtime `fetch('/api/x.json')` could not work here: ubean's static
// middleware skips `/api/*` (reserving it for `src/routes/` handlers), so on a
// site with no API routes — this one — the request fell through to the 404
// fallback and returned HTML, which the client then failed to JSON.parse
// ("Unexpected token '<'"). Importing the data also lets the SSG prerender the
// tables instead of shipping "Loading…" as the static content.
//
//  - The curated package list lives in `src/shared/api-packages.ts`, shared with
//    the prerender collector and the sidebar, so the three cannot diverge (they
//    used to, which produced four 404 sidebar links).
//  - Reads BUILT dist/*.d.ts (run `pnpm build` at the repo root first).
//  - Maps TypeDoc's verbose JSON → the small ubean-specific ApiDoc schema
//    consumed by <ApiTable> (see src/components/api-table.vue).
//  - Per-package failure does NOT abort the build; a stub JSON is emitted so the
//    app renders gracefully (ApiTable shows "no entries").
//  - The output directory is cleared of stale `*.json` first: a package removed
//    from the curated list must not keep serving month-old data.
//
// Usage: pnpm build:api
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { API_PACKAGES } from '../src/shared/api-packages';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(APP_ROOT, 'src/generated/api');
const TSCONFIG = resolve(APP_ROOT, 'tsconfig.typedoc.json');

/** Installs the `typescript` → aliased-real-TypeScript hook before TypeDoc loads. */
const REGISTER_LOADER = resolve(__dirname, 'typedoc-register.mjs');

// `pkg` is the public name used in the route /reference/api/<pkg>; `distDir` is
// where its built .d.ts lives.
const PACKAGES_ROOT = resolve(APP_ROOT, '../../packages');
const CURATED = API_PACKAGES.map(({ slug, distDir }) => ({
  pkg: slug,
  distDir: resolve(PACKAGES_ROOT, distDir, 'dist')
}));

// ---------------------------------------------------------------------------
// TypeDoc kind codes → human-readable labels (subset used by <ApiTable>).
// Full list: https://typedoc.org/documents/enums/ReflectionKind/
// ---------------------------------------------------------------------------
const KIND_LABEL = {
  32: 'const',         // Variable
  64: 'function',      // Function
  128: 'class',        // Class
  256: 'interface',    // Interface
  262144: 'type',      // TypeAlias
  4194304: 'reference' // Reference (re-export)
};

/**
 * Convert a TypeDoc type object to a readable string.
 * Handles: intrinsic, reference, array, union, intersection, literal,
 * reflection (inline), tuple, predicate, indexedAccess, conditional, typeOperator.
 */
function typeToString(type) {
  if (!type) return 'unknown';
  switch (type.type) {
    case 'intrinsic':
      return type.name;
    case 'reference':
      return type.name + (type.typeArguments ? `<${type.typeArguments.map(typeToString).join(', ')}>` : '');
    case 'array':
      return `${typeToString(type.elementType)}[]`;
    case 'union':
      return (type.types || []).map(typeToString).join(' | ');
    case 'intersection':
      return (type.types || []).map(typeToString).join(' & ');
    case 'literal':
      return JSON.stringify(type.value);
    case 'tuple':
      return `[${(type.elements || []).map(typeToString).join(', ')}]`;
    case 'typeOperator':
      return `${type.operator} ${typeToString(type.target)}`;
    case 'predicate':
      return `${type.name} is ${typeToString(type.targetType)}`;
    case 'indexedAccess':
      return `${typeToString(type.objectType)}[${typeToString(type.indexType)}]`;
    case 'conditional':
      return `${typeToString(type.checkType)} extends ${typeToString(type.extendsType)} ? ${typeToString(type.trueType)} : ${typeToString(type.falseType)}`;
    case 'reflection':
      return reflectionToString(type.declaration);
    case 'named-tuple-member':
      return `${type.name}: ${typeToString(type.element)}`;
    case 'optional':
      return typeToString(type.target);
    case 'rest':
      return `...${typeToString(type.elementType)}`;
    case 'template-literal':
      return '`template`';
    default:
      return type.name || type.type || 'unknown';
  }
}

/** Render an inline reflection (object type / function type) to a string. */
function reflectionToString(decl) {
  if (!decl) return 'unknown';
  // Function-type reflection has signatures.
  if (decl.signatures?.length) {
    const sig = decl.signatures[0];
    const params = (sig.parameters || []).map(p => `${p.name}: ${typeToString(p.type)}`).join(', ');
    return `(${params}) => ${typeToString(sig.type)}`;
  }
  // Object-type reflection: list properties.
  if (decl.children?.length) {
    const props = decl.children.slice(0, 6).map(c => `${c.name}${c.flags?.isOptional ? '?' : ''}: ${typeToString(c.type)}`);
    const more = decl.children.length > 6 ? '; …' : '';
    return `{ ${props.join('; ')}${more} }`;
  }
  return '{}';
}

/** Extract summary text from a TypeDoc comment object. */
function extractSummary(comment) {
  if (!comment?.summary?.length) return undefined;
  const text = comment.summary.map(s => s.text || '').join('');
  return text.trim() || undefined;
}

/** Extract a parameter's description from its comment. */
function extractParamComment(param) {
  if (!param.comment?.summary?.length) return undefined;
  return param.comment.summary.map(s => s.text || '').join('').trim() || undefined;
}

/** Extract default value from comment @default tag or flags. */
function extractDefault(param) {
  if (!param.comment?.blockTags?.length) return undefined;
  const def = param.comment.blockTags.find(t => t.tag === 'default');
  if (!def?.content?.length) return undefined;
  return def.content.map(s => s.text || '').join('').trim() || undefined;
}

/**
 * Map a single TypeDoc declaration (child of the project root) to an ApiEntry.
 * Returns null for re-exports (Reference) and entries without useful content.
 */
function mapEntry(child) {
  const kind = KIND_LABEL[child.kind];
  if (!kind || kind === 'reference') return null;

  const entry = {
    name: child.name,
    kind,
    summary: extractSummary(child.comment)
  };

  // Functions (kind 64): extract signatures → parameters + returns.
  if (child.kind === 64 && child.signatures?.length) {
    const sig = child.signatures[0];
    entry.summary = entry.summary || extractSummary(sig.comment);
    if (sig.parameters?.length) {
      entry.parameters = sig.parameters.map(p => ({
        name: p.name,
        type: typeToString(p.type),
        description: extractParamComment(p),
        default: extractDefault(p)
      }));
    }
    if (sig.type) {
      entry.returns = typeToString(sig.type);
    }
    entry.signature = buildFunctionSignature(child.name, sig);
  }

  // Interfaces (256) and Classes (128): extract children as properties.
  if ((child.kind === 256 || child.kind === 128) && child.children?.length) {
    const props = child.children
      .filter(c => c.kind === 1024) // Property
      .map(c => ({
        name: c.name,
        type: typeToString(c.type),
        description: extractSummary(c.comment),
        optional: !!c.flags?.isOptional
      }));
    if (props.length) entry.properties = props;
  }

  // Type aliases (262144): include the type string as signature.
  if (child.kind === 262144 && child.type) {
    entry.signature = `type ${child.name} = ${typeToString(child.type)}`;
  }

  // Variables (32): include the type.
  if (child.kind === 32 && child.type) {
    entry.signature = `const ${child.name}: ${typeToString(child.type)}`;
  }

  return entry;
}

/** Build a human-readable function signature string. */
function buildFunctionSignature(name, sig) {
  const params = (sig.parameters || []).map(p => {
    const optional = p.flags?.isOptional ? '?' : '';
    const type = typeToString(p.type);
    return `${p.name}${optional}: ${type}`;
  });
  const ret = sig.type ? typeToString(sig.type) : 'void';
  return `function ${name}(${params.join(', ')}): ${ret}`;
}

/**
 * Transform TypeDoc's raw JSON output into the simplified ApiDoc schema.
 */
function mapTypedocToApiDoc(typedocJson, pkgName) {
  const children = typedocJson.children || [];
  const entries = [];
  const seen = new Set();
  for (const child of children) {
    // Skip duplicate names (TypeDoc can emit duplicates for overloads/re-exports).
    if (seen.has(child.name)) continue;
    const entry = mapEntry(child);
    if (entry) {
      entries.push(entry);
      seen.add(child.name);
    }
  }
  return {
    name: pkgName,
    generatedAt: new Date().toISOString(),
    entries
  };
}

// ---------------------------------------------------------------------------
// TypeDoc runner + stub fallback.
// ---------------------------------------------------------------------------

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

/**
 * Resolve TypeDoc's CLI entry, the real `bin/typedoc` script.
 *
 * Not `npx typedoc`: npx resolves through the workspace's `.bin`, which points at the
 * TypeDoc instance peer-bound to the tsgo bridge. We need to invoke Node ourselves so
 * the loader hook (see below) is installed before TypeDoc loads its `typescript` import.
 */
function resolveTypeDocBin(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('typedoc/package.json');

    return resolve(dirname(pkgPath), 'bin', 'typedoc');
  } catch {
    return null;
  }
}

/**
 * Run TypeDoc over a single package's dist/index.d.ts.
 * Writes the simplified ApiDoc JSON to outPath.
 * Returns true on success, false on failure (stub emitted).
 */
function runTypeDoc(entryPoint, outPath, pkgName) {
  const tmpJson = resolve(tmpdir(), `typedoc-${pkgName}-${Date.now()}.json`);
  const typedocBin = resolveTypeDocBin();

  if (!typedocBin || !existsSync(typedocBin)) {
    emitStub(outPath, pkgName, 'typedoc not installed (run pnpm install)');
    return false;
  }

  // Run TypeDoc through the loader that points its `typescript` import at the aliased
  // real TypeScript. Without it TypeDoc exits 6 (`declaration.type.getChildAt is not a
  // function`) because the workspace forces the tsgo bridge, which does not implement
  // every compiler API TypeDoc drives. See scripts/typedoc-typescript-loader.mjs.
  const args = [
    '--import', REGISTER_LOADER,
    typedocBin,
    '--json', tmpJson,
    '--entryPoints', entryPoint,
    '--entryPointStrategy', 'expand',
    '--tsconfig', TSCONFIG,
    '--logLevel', 'Error',
    '--excludePrivate',
    '--excludeInternal',
    '--readme', 'none'
  ];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: APP_ROOT });

  if (result.status !== 0) {
    const detail =
      (result.stderr || result.stdout || '')
        .split('\n')
        .find(l => l.trim() && !l.includes('npm warn') && !l.includes('TNB ACTIVE')) || 'unknown error';
    emitStub(outPath, pkgName, `typedoc exit ${result.status}: ${detail}`);
    rmSync(tmpJson, { force: true });
    return false;
  }

  if (!existsSync(tmpJson)) {
    emitStub(outPath, pkgName, 'typedoc produced no JSON output');
    return false;
  }

  try {
    const raw = JSON.parse(readFileSync(tmpJson, 'utf8'));
    const apiDoc = mapTypedocToApiDoc(raw, pkgName);
    writeFileSync(outPath, `${JSON.stringify(apiDoc, null, 2)}\n`, 'utf8');
    const rel = relative(APP_ROOT, outPath);
    console.log(`[build:api] generated ${pkgName} → ${rel} (${apiDoc.entries.length} entries)`);
    rmSync(tmpJson, { force: true });
    return true;
  } catch (err) {
    emitStub(outPath, pkgName, `mapper error: ${err.message}`);
    rmSync(tmpJson, { force: true });
    return false;
  }
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Drop previously generated JSON before regenerating. Without this, a package
  // removed from the curated list keeps serving its last successful output, and
  // its prerendered page renders stale data instead of "no entries".
  for (const file of readdirSync(OUT_DIR)) {
    if (file.endsWith('.json')) {
      rmSync(resolve(OUT_DIR, file), { force: true });
    }
  }

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
    if (runTypeDoc(entry, outPath, pkg)) {
      built++;
    } else {
      stubs++;
    }
  }

  console.log(`[build:api] done — ${built} generated, ${stubs} stubs.`);
  if (stubs > 0) {
    console.warn('[build:api] WARNING: some packages were stubbed. See output above.');
  }
}

main();
