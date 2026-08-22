import { mkdtemp, rm, mkdir, writeFile, readFile, unlink, copyFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  defineDevToolsTab,
  getCustomTabs,
  clearCustomTabs,
  buildDevToolsInfo,
  emptyDevToolsInfo,
  UBEAN_INFO_STATE_KEY,
  maskSensitiveEnv,
  createDevToolsHooks,
  createCrudServer,
  createAiServer,
  createTerminalServer,
  createAllRpcFunctions,
  ubeanDevtoolsPlugin
} from '../src';
import type { ScanResultLike, DevToolsConfigMeta } from '../src/node/state';
import type { DevToolsScaffoldOps, DevToolsFsOps, ScaffoldOptions, ScaffoldResult } from '../src/types';

// ---------------------------------------------------------------------------
// Test scaffoldOps — provides real filesystem operations for CRUD tests
// ---------------------------------------------------------------------------

const SCAFFOLD_DIRS: Record<string, string> = {
  page: 'src/pages',
  api: 'src/routes',
  layout: 'src/layouts',
  middleware: 'src/middleware',
  reuse: 'src/reuse'
};

function createTestScaffoldOps(): DevToolsScaffoldOps {
  const createFsOps = (cwd: string): DevToolsFsOps => {
    const resolvePath = (p: string): string => (isAbsolute(p) ? p : resolve(cwd, p));
    const exists = async (p: string): Promise<boolean> => {
      try {
        await access(resolvePath(p));
        return true;
      } catch {
        return false;
      }
    };
    return {
      exists,
      readFile: (p, enc?) => readFile(resolvePath(p), enc),
      writeFile: async (p, content, enc?) => {
        const full = resolvePath(p);
        await mkdir(join(full, '..'), { recursive: true });
        await writeFile(full, content, enc);
      },
      remove: (p: string) => unlink(resolvePath(p)),
      copyFile: (src, dest) => copyFile(resolvePath(src), resolvePath(dest)),
      createBackup: async (p, opts?) => {
        const full = resolvePath(p);
        const suffix = opts?.backupSuffix ?? '.bak';
        const backupPath = `${full}${suffix}`;
        if (await exists(full)) {
          await copyFile(full, backupPath);
          if (opts?.removeOriginal) await unlink(full);
          return backupPath;
        }
        return null;
      },
      removeBackup: async (p, opts?) => {
        const suffix = opts?.backupSuffix ?? '.bak';
        const backupPath = `${resolvePath(p)}${suffix}`;
        try {
          await unlink(backupPath);
        } catch {
          /* ignore */
        }
      }
    };
  };

  const getScaffoldPath = (opts: ScaffoldOptions): string => {
    const dir = opts.baseDir || SCAFFOLD_DIRS[opts.type] || 'src';
    const normalizedPath = opts.path.startsWith('/') ? opts.path.slice(1) : opts.path;
    const ext = opts.type === 'api' || opts.type === 'middleware' ? '.ts' : '.vue';
    const fileName = normalizedPath.endsWith(ext) ? normalizedPath : `${normalizedPath}${ext}`;
    return join(dir, fileName);
  };

  const scaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    if (!SCAFFOLD_DIRS[opts.type]) {
      return { created: [], deleted: [], restored: [], skipped: [], errors: [`Unsupported type: ${opts.type}`] };
    }
    const cwd = opts.cwd || '.';
    const fs = createFsOps(cwd);
    const filePath = getScaffoldPath(opts);
    if (!opts.force && (await fs.exists(filePath))) {
      return { created: [], deleted: [], restored: [], skipped: [filePath], errors: ['File already exists'] };
    }
    const content =
      opts.type === 'api'
        ? `import { defineHandler } from 'ubean';\n\nexport const GET = defineHandler(c => c.json({ ok: true }));\n`
        : `<template>\n  <div>${opts.path}</div>\n</template>\n`;
    await fs.writeFile(filePath, content);
    return { created: [filePath], deleted: [], restored: [], skipped: [], errors: [] };
  };

  const deleteScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    const cwd = opts.cwd || '.';
    const fs = createFsOps(cwd);
    const filePath = getScaffoldPath(opts);
    if (!(await fs.exists(filePath))) {
      return { created: [], deleted: [], restored: [], skipped: [], errors: [`File not found: ${filePath}`] };
    }
    await fs.createBackup(filePath, { removeOriginal: true });
    return { created: [], deleted: [filePath], restored: [], skipped: [], errors: [] };
  };

  const recoverScaffold = async (opts: ScaffoldOptions): Promise<ScaffoldResult> => {
    const cwd = opts.cwd || '.';
    const fs = createFsOps(cwd);
    const filePath = isAbsolute(opts.path) ? opts.path : getScaffoldPath(opts);
    const backupPath = `${filePath}.bak`;
    if (!(await fs.exists(backupPath))) {
      return { created: [], deleted: [], restored: [], skipped: [], errors: [] };
    }
    await fs.copyFile(backupPath, filePath);
    await fs.removeBackup(filePath);
    return { created: [], deleted: [], restored: [filePath], skipped: [], errors: [] };
  };

  return { createFsOps, scaffold, deleteScaffold, recoverScaffold };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScanResult(): ScanResultLike {
  return {
    apiRoutes: [
      { method: 'get', route: '/api/users', relativePath: 'routes/users.ts', fullPath: '/project/src/routes/users.ts' },
      { method: 'post', route: '/api/users', relativePath: 'routes/users.ts', fullPath: '/project/src/routes/users.ts' }
    ],
    pages: [
      {
        route: '/',
        name: 'Home',
        relativePath: 'pages/index.vue',
        fullPath: '/project/src/pages/index.vue',
        isReuse: false
      },
      {
        route: '/about',
        name: 'About',
        relativePath: 'pages/about.vue',
        fullPath: '/project/src/pages/about.vue',
        isReuse: false,
        layout: 'default'
      },
      {
        route: '/reuse-template',
        name: 'ReuseTemplate',
        relativePath: 'pages/reuse-template.reuse.ts',
        fullPath: '/project/src/pages/reuse-template.reuse.ts',
        isReuse: true
      }
    ],
    middlewares: [
      { global: true, relativePath: 'middleware/global.ts', fullPath: '/project/src/middleware/global.ts' },
      { global: false, relativePath: 'middleware/admin/auth.ts', fullPath: '/project/src/middleware/admin/auth.ts' }
    ],
    layouts: [
      {
        name: 'default',
        path: 'layouts/default.vue',
        relativePath: 'layouts/default.vue',
        fullPath: '/project/src/layouts/default.vue',
        isDefault: true
      },
      {
        name: 'admin',
        path: 'layouts/admin.vue',
        relativePath: 'layouts/admin.vue',
        fullPath: '/project/src/layouts/admin.vue',
        isDefault: false
      }
    ],
    crons: [{ name: 'cleanup', relativePath: 'crons/01.cleanup.ts', fullPath: '/project/src/crons/01.cleanup.ts' }]
  };
}

function makeConfigMeta(): DevToolsConfigMeta {
  return {
    preset: 'node',
    rootDir: '/project',
    srcDir: '/project/src',
    openAPI: { enabled: true, scalarPath: '/_scalar', openAPIPath: '/_openapi.json' }
  };
}

// ---------------------------------------------------------------------------
// buildDevToolsInfo / emptyDevToolsInfo
// ---------------------------------------------------------------------------

describe('buildDevToolsInfo', () => {
  it('builds info from scan + config metadata', () => {
    const startTime = 1000;
    const info = buildDevToolsInfo({
      scan: makeScanResult(),
      configMeta: makeConfigMeta(),
      customTabs: [],
      startTime,
      envData: { NODE_ENV: 'development' }
    });

    expect(info.version).toBe('0.0.1');
    expect(info.startTime).toBe(startTime);
    expect(info.apiRoutes).toBe(2);
    expect(info.pages).toBe(2); // reuse page filtered out
    expect(info.middleware).toBe(2);
    expect(info.layouts).toBe(2);
    expect(info.crons).toBe(1);
    expect(info.routes).toHaveLength(2);
    expect(info.routes?.[0].method).toBe('GET');
    expect(info.routes?.[1].method).toBe('POST');
    expect(info.pagesList).toHaveLength(2);
    expect(info.pagesList?.[0].name).toBe('Home');
    expect(info.pagesList?.[1].layout).toBe('default');
    expect(info.middlewaresList).toHaveLength(2);
    expect(info.middlewaresList?.[0].global).toBe(true);
    expect(info.layoutsList).toHaveLength(2);
    expect(info.layoutsList?.[0].isDefault).toBe(true);
    expect(info.cronsList).toHaveLength(1);
    expect(info.cronsList?.[0].name).toBe('cleanup');
    expect(info.presets).toEqual(['node']);
    expect(info.config).toEqual({ preset: 'node', rootDir: '/project', srcDir: '/project/src' });
    expect(info.openAPI?.enabled).toBe(true);
    expect(info.openAPI?.scalarPath).toBe('/_scalar');
    expect(info.env?.NODE_ENV).toBe('development');
  });

  it('assigns default layout to pages without explicit layout', () => {
    const info = buildDevToolsInfo({
      scan: makeScanResult(),
      configMeta: makeConfigMeta(),
      customTabs: [],
      startTime: 0,
      envData: {}
    });

    const home = info.pagesList?.find(p => p.name === 'Home');
    expect(home?.layout).toBe('default'); // picked from default layout
  });

  it('respects explicit false layout', () => {
    const scan = makeScanResult();
    scan.pages[0].layout = false;

    const info = buildDevToolsInfo({
      scan,
      configMeta: makeConfigMeta(),
      customTabs: [],
      startTime: 0,
      envData: {}
    });

    const home = info.pagesList?.find(p => p.name === 'Home');
    expect(home?.layout).toBeUndefined();
  });

  it('handles null scan gracefully', () => {
    const info = buildDevToolsInfo({
      scan: null,
      configMeta: null,
      customTabs: [],
      startTime: 42,
      envData: {}
    });

    expect(info.pages).toBe(0);
    expect(info.apiRoutes).toBe(0);
    expect(info.routes).toEqual([]);
    expect(info.pagesList).toEqual([]);
    expect(info.config).toEqual({});
    expect(info.presets).toEqual([]);
  });

  it('masks sensitive env vars in the built info', () => {
    const info = buildDevToolsInfo({
      scan: null,
      configMeta: null,
      customTabs: [],
      startTime: 0,
      envData: {
        PUBLIC_VAR: 'visible',
        API_KEY: 'secret',
        DB_PASSWORD: 'pass123',
        NORMAL: 'ok'
      }
    });

    expect(info.env?.PUBLIC_VAR).toBe('visible');
    expect(info.env?.API_KEY).toBe('***');
    expect(info.env?.DB_PASSWORD).toBe('***');
    expect(info.env?.NORMAL).toBe('ok');
  });

  it('includes custom tabs in the info', () => {
    const tabs = [
      { id: 'tab1', label: 'Tab 1', src: '/tab1' },
      { id: 'tab2', label: 'Tab 2', src: '/tab2', icon: 'lucide:star' }
    ];

    const info = buildDevToolsInfo({
      scan: null,
      configMeta: null,
      customTabs: tabs,
      startTime: 0,
      envData: {}
    });

    expect(info.customTabs).toHaveLength(2);
    expect(info.customTabs?.[0].id).toBe('tab1');
    expect(info.customTabs?.[1].icon).toBe('lucide:star');
  });

  it('detects AI enabled from env vars', () => {
    const oldKey = process.env.UBEAN_AI_API_KEY;
    process.env.UBEAN_AI_API_KEY = 'test-key';

    const info = buildDevToolsInfo({
      scan: null,
      configMeta: null,
      customTabs: [],
      startTime: 0,
      envData: {}
    });

    expect(info.ai?.enabled).toBe(true);

    if (oldKey === undefined) {
      delete process.env.UBEAN_AI_API_KEY;
    } else {
      process.env.UBEAN_AI_API_KEY = oldKey;
    }
  });
});

describe('emptyDevToolsInfo', () => {
  it('returns zeroed-out info', () => {
    const info = emptyDevToolsInfo(9999);

    expect(info.version).toBe('0.0.1');
    expect(info.startTime).toBe(9999);
    expect(info.pages).toBe(0);
    expect(info.apiRoutes).toBe(0);
    expect(info.middleware).toBe(0);
    expect(info.layouts).toBe(0);
    expect(info.crons).toBe(0);
    expect(info.routes).toEqual([]);
    expect(info.pagesList).toEqual([]);
    expect(info.middlewaresList).toEqual([]);
    expect(info.layoutsList).toEqual([]);
    expect(info.cronsList).toEqual([]);
    expect(info.customTabs).toEqual([]);
    expect(info.presets).toEqual([]);
    expect(info.config).toEqual({});
    expect(info.ai?.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UBEAN_INFO_STATE_KEY
// ---------------------------------------------------------------------------

describe('UBEAN_INFO_STATE_KEY', () => {
  it('is the shared state key string', () => {
    expect(UBEAN_INFO_STATE_KEY).toBe('ubean:info');
    expect(typeof UBEAN_INFO_STATE_KEY).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// maskSensitiveEnv
// ---------------------------------------------------------------------------

describe('maskSensitiveEnv', () => {
  it('masks keys containing KEY, SECRET, TOKEN, PASSWORD, AUTH, CREDENTIAL', () => {
    const masked = maskSensitiveEnv({
      API_KEY: 'k1',
      CLIENT_SECRET: 's1',
      AUTH_TOKEN: 't1',
      DB_PASSWORD: 'p1',
      MY_CREDENTIAL: 'c1',
      AUTH_HEADER: 'a1',
      PUBLIC_VAR: 'visible',
      NORMAL: 'ok'
    });

    expect(masked.API_KEY).toBe('***');
    expect(masked.CLIENT_SECRET).toBe('***');
    expect(masked.AUTH_TOKEN).toBe('***');
    expect(masked.DB_PASSWORD).toBe('***');
    expect(masked.MY_CREDENTIAL).toBe('***');
    expect(masked.AUTH_HEADER).toBe('***');
    expect(masked.PUBLIC_VAR).toBe('visible');
    expect(masked.NORMAL).toBe('ok');
  });

  it('handles empty env', () => {
    expect(maskSensitiveEnv({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// createDevToolsHooks
// ---------------------------------------------------------------------------

describe('createDevToolsHooks', () => {
  it('registers and runs beforeCreate hook', async () => {
    const hooks = createDevToolsHooks();
    let called = false;
    let ctx: any = null;

    hooks.registerHook('beforeCreate', c => {
      called = true;
      ctx = c;
    });

    await hooks.runHook('beforeCreate', { type: 'page', path: '/test' });
    expect(called).toBe(true);
    expect(ctx.type).toBe('page');
    expect(ctx.path).toBe('/test');
  });

  it('runs multiple hooks in sequence', async () => {
    const hooks = createDevToolsHooks();
    const order: string[] = [];

    hooks.registerHook('afterCreate', () => order.push('1'));
    hooks.registerHook('afterCreate', () => order.push('2'));
    hooks.registerHook('afterCreate', () => order.push('3'));

    await hooks.runHook('afterCreate', { type: 'api', path: '/x' });
    expect(order).toEqual(['1', '2', '3']);
  });

  it('supports async hooks', async () => {
    const hooks = createDevToolsHooks();
    let called = false;

    hooks.registerHook('beforeDelete', async () => {
      await new Promise(r => setTimeout(r, 10));
      called = true;
    });

    await hooks.runHook('beforeDelete', { type: 'page', path: '/t' });
    expect(called).toBe(true);
  });

  it('removeHook removes a specific handler', async () => {
    const hooks = createDevToolsHooks();
    let called = false;
    const handler = () => {
      called = true;
    };

    hooks.registerHook('beforeCreate', handler);
    hooks.removeHook('beforeCreate', handler);
    await hooks.runHook('beforeCreate', { type: 'page', path: '/t' });
    expect(called).toBe(false);
  });

  it('removeAllHooks clears everything', async () => {
    const hooks = createDevToolsHooks();
    let a = false;
    let b = false;

    hooks.registerHook('beforeCreate', () => {
      a = true;
    });
    hooks.registerHook('beforeUpdate', () => {
      b = true;
    });
    hooks.removeAllHooks();
    await hooks.runHook('beforeCreate', { type: 'page', path: '/t' });
    await hooks.runHook('beforeUpdate', { type: 'env', key: 'X' });
    expect(a).toBe(false);
    expect(b).toBe(false);
  });

  it('propagates hook errors', async () => {
    const hooks = createDevToolsHooks();
    hooks.registerHook('afterCreate', () => {
      throw new Error('hook error');
    });
    await expect(hooks.runHook('afterCreate', { type: 'page', path: '/t' })).rejects.toThrow('hook error');
  });
});

// ---------------------------------------------------------------------------
// createCrudServer
// ---------------------------------------------------------------------------

describe('createCrudServer', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ubean-devtools-crud-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exposes create/read/update/delete/restore methods', () => {
    const crud = createCrudServer({ cwd: tmpDir, scaffoldOps: createTestScaffoldOps() });
    expect(typeof crud.create).toBe('function');
    expect(typeof crud.read).toBe('function');
    expect(typeof crud.update).toBe('function');
    expect(typeof crud.delete).toBe('function');
    expect(typeof crud.restore).toBe('function');
  });

  it('creates a page scaffold', async () => {
    const crud = createCrudServer({ cwd: tmpDir, scaffoldOps: createTestScaffoldOps() });
    const result = await crud.create({ type: 'page', path: 'test-page' });
    expect(result.success).toBe(true);
    expect(result.created).toBeDefined();
    expect(result.created!.length).toBeGreaterThan(0);
  });

  it('reads env data (raw — masking is done by the RPC layer)', async () => {
    const envData: Record<string, string> = {
      PUBLIC: 'visible',
      SECRET_KEY: 'secret'
    };
    const crud = createCrudServer({
      cwd: tmpDir,
      scaffoldOps: createTestScaffoldOps(),
      getEnv: () => envData,
      setEnv: env => {
        Object.keys(envData).forEach(k => delete envData[k]);
        Object.assign(envData, env);
      }
    });
    const result = await crud.read({ type: 'env' });
    expect(result.success).toBe(true);
    const env = result.data as Record<string, string>;
    expect(env.PUBLIC).toBe('visible');
    // CRUD returns raw env — masking is applied by the `ubean:get-env` RPC function
    expect(env.SECRET_KEY).toBe('secret');
  });

  it('updates env by adding keys and deleting via undefined value', async () => {
    const envData: Record<string, string> = { EXISTING: 'val' };
    const crud = createCrudServer({
      cwd: tmpDir,
      scaffoldOps: createTestScaffoldOps(),
      getEnv: () => envData,
      setEnv: env => {
        Object.keys(envData).forEach(k => delete envData[k]);
        Object.assign(envData, env);
      }
    });

    await crud.update({ type: 'env', key: 'NEW_VAR', value: 'new' });
    expect(envData.NEW_VAR).toBe('new');
    expect(envData.EXISTING).toBe('val');

    // Setting value to undefined deletes the key
    await crud.update({ type: 'env', key: 'EXISTING', value: undefined });
    expect(envData.EXISTING).toBeUndefined();
  });

  it('deletes env keys', async () => {
    const envData: Record<string, string> = { A: '1', B: '2' };
    const crud = createCrudServer({
      cwd: tmpDir,
      scaffoldOps: createTestScaffoldOps(),
      getEnv: () => envData,
      setEnv: env => {
        Object.keys(envData).forEach(k => delete envData[k]);
        Object.assign(envData, env);
      }
    });

    await crud.delete({ type: 'env', key: 'A' });
    expect(envData.A).toBeUndefined();
    expect(envData.B).toBe('2');
  });

  it('returns error for unsupported create type', async () => {
    const crud = createCrudServer({ cwd: tmpDir, scaffoldOps: createTestScaffoldOps() });
    // @ts-expect-error test invalid type
    const result = await crud.create({ type: 'invalid', path: 'test' });
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Unsupported resource type');
  });

  it('returns error for config update without path', async () => {
    const crud = createCrudServer({ cwd: tmpDir, scaffoldOps: createTestScaffoldOps(), getConfig: () => ({}) });
    const result = await crud.update({ type: 'config' });
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Path is required');
  });

  it('returns error for env update without key', async () => {
    const crud = createCrudServer({
      cwd: tmpDir,
      scaffoldOps: createTestScaffoldOps(),
      getEnv: () => ({}),
      setEnv: () => {}
    });
    const result = await crud.update({ type: 'env', value: 'val' });
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Key is required');
  });

  it('returns error for env delete without key', async () => {
    const crud = createCrudServer({
      cwd: tmpDir,
      scaffoldOps: createTestScaffoldOps(),
      getEnv: () => ({}),
      setEnv: () => {}
    });
    const result = await crud.delete({ type: 'env' });
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Key is required');
  });

  it('returns error for file delete without path', async () => {
    const crud = createCrudServer({ cwd: tmpDir, scaffoldOps: createTestScaffoldOps() });
    const result = await crud.delete({ type: 'page' });
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Path is required');
  });

  it('restore returns error when no backup exists', async () => {
    const crud = createCrudServer({ cwd: tmpDir, scaffoldOps: createTestScaffoldOps() });
    const result = await crud.restore('/nonexistent/path');
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('No backup found');
  });

  it('runs hooks around CRUD operations', async () => {
    const hooks = createDevToolsHooks();
    const log: string[] = [];

    hooks.registerHook('beforeCreate', () => log.push('before'));
    hooks.registerHook('afterCreate', () => log.push('after'));

    const crud = createCrudServer({ cwd: tmpDir, scaffoldOps: createTestScaffoldOps(), hooks });
    await crud.create({ type: 'page', path: 'hooked-page' });

    expect(log).toContain('before');
    expect(log).toContain('after');
  });
});

// ---------------------------------------------------------------------------
// createAiServer
// ---------------------------------------------------------------------------

describe('createAiServer', () => {
  it('exposes getToolDefinitions and chat methods', () => {
    const crud = createCrudServer({ cwd: '.', scaffoldOps: createTestScaffoldOps() });
    const ai = createAiServer(crud, () => emptyDevToolsInfo(0));
    expect(typeof ai.getToolDefinitions).toBe('function');
    expect(typeof ai.chat).toBe('function');
  });

  it('returns tool definitions', () => {
    const crud = createCrudServer({ cwd: '.', scaffoldOps: createTestScaffoldOps() });
    const ai = createAiServer(crud, () => emptyDevToolsInfo(0));
    const tools = ai.getToolDefinitions();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// createAllRpcFunctions
// ---------------------------------------------------------------------------

describe('createAllRpcFunctions', () => {
  it('returns an array of RPC function definitions', () => {
    // createAllRpcFunctions needs a SharedState, but for type/name checking
    // we can use a minimal mock.
    const mockState = {
      value: () => emptyDevToolsInfo(0),
      mutate: () => {},
      on: () => () => {}
    };

    const crud = createCrudServer({ cwd: '.', scaffoldOps: createTestScaffoldOps() });
    const ai = createAiServer(crud, () => emptyDevToolsInfo(0));
    const terminal = createTerminalServer();

    const fns = createAllRpcFunctions({
      // @ts-expect-error ignore state type
      state: mockState,
      getEnvData: () => ({}),
      crud,
      ai,
      terminal
    });

    expect(Array.isArray(fns)).toBe(true);
    expect(fns.length).toBe(16); // 2 info + 5 crud + 3 ai + 1 playground + 5 terminal

    const names = fns.map((f: any) => f.name);
    expect(names).toContain('ubean:get-info');
    expect(names).toContain('ubean:get-env');
    expect(names).toContain('ubean:crud:create');
    expect(names).toContain('ubean:crud:read');
    expect(names).toContain('ubean:crud:update');
    expect(names).toContain('ubean:crud:delete');
    expect(names).toContain('ubean:crud:restore');
    expect(names).toContain('ubean:ai:tools');
    expect(names).toContain('ubean:ai:chat');
    expect(names).toContain('ubean:ai:chat-stream');
    expect(names).toContain('ubean:playground:invoke');
    expect(names).toContain('ubean:terminal:start');
    expect(names).toContain('ubean:terminal:input');
    expect(names).toContain('ubean:terminal:resize');
    expect(names).toContain('ubean:terminal:poll');
    expect(names).toContain('ubean:terminal:kill');
  });
});

// ---------------------------------------------------------------------------
// ubeanDevtoolsPlugin
// ---------------------------------------------------------------------------

describe('ubeanDevtoolsPlugin', () => {
  it('returns a Vite plugin with the correct name', () => {
    const plugin = ubeanDevtoolsPlugin({ getCwd: () => '.' });
    expect(plugin.name).toBe('ubean:devtools');
  });

  it('has a devtools.setup hook', () => {
    const plugin = ubeanDevtoolsPlugin({ getCwd: () => '.' });
    expect(plugin.devtools).toBeDefined();
    expect(typeof plugin.devtools?.setup).toBe('function');
  });

  it('accepts all option accessors', () => {
    const plugin = ubeanDevtoolsPlugin({
      getCwd: () => '/project',
      getApp: () => undefined,
      getScanResult: () => null,
      getConfigMeta: () => null,
      getCustomTabs: () => [],
      ai: { apiKey: 'test' },
      registerRefresh: () => {}
    });
    expect(plugin.name).toBe('ubean:devtools');
  });

  it('uses default getCwd when not provided', () => {
    const plugin = ubeanDevtoolsPlugin();
    expect(plugin.name).toBe('ubean:devtools');
  });
});

// ---------------------------------------------------------------------------
// Custom Tabs (from ubean, re-tested here for integration)
// ---------------------------------------------------------------------------

describe('Custom Tabs Integration', () => {
  beforeEach(() => {
    clearCustomTabs();
  });

  it('defines and retrieves custom tabs', () => {
    defineDevToolsTab({ id: 'my-tab', label: 'My Tab', src: '/my-tab' });
    const tabs = getCustomTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe('my-tab');
  });

  it('overwrites tab with same id', () => {
    defineDevToolsTab({ id: 'dup', label: 'First', src: '/a' });
    defineDevToolsTab({ id: 'dup', label: 'Second', src: '/b' });
    const tabs = getCustomTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].label).toBe('Second');
  });

  it('returns a copy of tabs array', () => {
    defineDevToolsTab({ id: 't1', label: 'T1', src: '/t1' });
    const tabs = getCustomTabs();
    tabs.push({ id: 'fake', label: 'Fake', src: '/fake' });
    expect(getCustomTabs()).toHaveLength(1);
  });

  it('clears all tabs', () => {
    defineDevToolsTab({ id: 'a', label: 'A', src: '/a' });
    defineDevToolsTab({ id: 'b', label: 'B', src: '/b' });
    clearCustomTabs();
    expect(getCustomTabs()).toHaveLength(0);
  });

  it('supports optional icon and sandbox', () => {
    const tab = defineDevToolsTab({
      id: 'minimal',
      label: 'Minimal',
      src: '/m',
      icon: 'lucide:star',
      sandbox: ['allow-scripts']
    });
    expect(tab.icon).toBe('lucide:star');
    expect(tab.sandbox).toEqual(['allow-scripts']);
  });
});
