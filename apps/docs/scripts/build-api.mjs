// @ubean/docs — build:api script.
// Runs TypeDoc over the curated subset of ubean packages' built dist/*.d.ts
// and emits apps/docs/public/api/<pkg>.json for the <ApiTable> renderer.
//
// Per DESIGN.md D4/D5/D6:
//  - Curated subset (7): ubean, @ubean/client, @ubean/vue, @ubean/scan,
//    @ubean/config, @ubean/auth, @ubean/integrations.
//  - Reads BUILT dist/*.d.ts (run `pnpm build` at repo root first).
//  - Maps TypeDoc's verbose JSON → the small ubean-specific ApiDoc schema
//    consumed by <ApiTable> (see src/components/api-table.vue). Per Risks §7:
//    "write a thin mapper to a small ubean-specific JSON schema".
//  - Per-package failure does NOT abort the build; a stub JSON is emitted so
//    the app renders gracefully (ApiTable shows "no entries").
//
// Usage: node scripts/build-api.mjs [--packages-root <path>]
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(APP_ROOT, 'public/api');
const TSCONFIG = resolve(APP_ROOT, 'tsconfig.typedoc.json');

// Map: output file → package name + dist path. `pkg` is the public name used
// in the route /reference/api/<pkg>; `distDir` is where its built .d.ts lives.
const PACKAGES_ROOT = resolve(APP_ROOT, '../../packages');
const CURATED = [
  { pkg: 'ubean', distDir: resolve(PACKAGES_ROOT, 'ubean/dist') },
  { pkg: 'client', distDir: resolve(PACKAGES_ROOT, 'client/dist') },
  { pkg: 'vue', distDir: resolve(PACKAGES_ROOT, 'vue/dist') },
  { pkg: 'scan', distDir: resolve(PACKAGES_ROOT, 'scan/dist') },
  { pkg: 'config', distDir: resolve(PACKAGES_ROOT, 'config/dist') },
  { pkg: 'auth', distDir: resolve(PACKAGES_ROOT, 'auth/dist') },
  { pkg: 'integrations', distDir: resolve(PACKAGES_ROOT, 'integrations/dist') }
];

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
 * Run TypeDoc over a single package's dist/index.d.ts.
 * Writes the simplified ApiDoc JSON to outPath.
 * Returns true on success, false on failure (stub emitted).
 */
function runTypeDoc(entryPoint, outPath, pkgName) {
  const tmpJson = resolve(tmpdir(), `typedoc-${pkgName}-${Date.now()}.json`);
  const args = [
    'typedoc',
    '--json', tmpJson,
    '--entryPoints', entryPoint,
    '--entryPointStrategy', 'expand',
    '--tsconfig', TSCONFIG,
    '--logLevel', 'Error',
    '--excludePrivate',
    '--excludeInternal',
    '--readme', 'none'
  ];
  const result = spawnSync('npx', args, { encoding: 'utf8', cwd: APP_ROOT });

  if (result.status !== 0) {
    emitStub(outPath, pkgName, `typedoc exit ${result.status}: ${(result.stderr || result.stdout || '').split('\n').find(l => l.trim() && !l.includes('npm warn')) || 'unknown error'}`);
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
