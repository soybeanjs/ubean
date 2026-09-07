/**
 * App root component (`src/App.vue` + `defineApp({ appRoot })`) — virtual
 * module generation tests.
 *
 * Verifies that `createVueAppEntryVirtualModule`:
 * 1. static-imports `src/App.vue` as `_rootApp` when the scan detects it;
 * 2. `resolveAppConfig` injects `_rootApp` as the DEFAULT `appRoot` so both
 *    the client (`resolveAppConfig('client')`) and the dev/prod SSR renderer
 *    (`resolveAppConfig('server')`, consumed via `@ubean/client/ssr`) agree —
 *    otherwise the appRoot wrapper would appear on one side only and hydration
 *    would mismatch;
 * 3. an explicit `defineApp({ appRoot })` in app.ts / app.client.ts /
 *    app.server.ts overrides the file fallback (merge is last-wins).
 */
import { describe, it, expect } from 'vitest';
import type { ScannedAppEntry } from '@ubean/scan';
import { createVueAppEntryVirtualModule } from '../src/vue-virtual-modules';

function makeEntry(root = false, shared = false): ScannedAppEntry {
  return {
    shared: shared ? { exists: true, fullPath: '/proj/src/app.ts', relativePath: 'app.ts' } : { exists: false },
    server: { exists: false },
    client: { exists: false },
    ...(root ? { root: { exists: true, fullPath: '/proj/src/App.vue', relativePath: 'App.vue' } } : {})
  };
}

describe('createVueAppEntryVirtualModule — appRoot', () => {
  it('static-imports src/App.vue when detected', async () => {
    const mod = createVueAppEntryVirtualModule(makeEntry(true));
    const code = await mod.load();
    expect(code).toContain('import _rootApp from "/proj/src/App.vue";');
    expect(code).toContain('appRoot: config.appRoot');
  });

  it('lowercase src/app.vue path is imported verbatim (case preserved)', async () => {
    const mod = createVueAppEntryVirtualModule({
      shared: { exists: false },
      server: { exists: false },
      client: { exists: false },
      root: { exists: true, fullPath: '/proj/src/app.vue', relativePath: 'app.vue' }
    });
    const code = await mod.load();
    expect(code).toContain('import _rootApp from "/proj/src/app.vue";');
  });

  it('no src/App.vue → const _rootApp = null', async () => {
    const mod = createVueAppEntryVirtualModule(makeEntry(false));
    const code = await mod.load();
    expect(code).toContain('const _rootApp = null;');
  });

  it('resolveAppConfig injects _rootApp as default appRoot (client)', async () => {
    const mod = createVueAppEntryVirtualModule(makeEntry(true));
    // Evaluate the generated module in a VM-like sandbox: it only references
    // bare imports, so stub them out by transforming into a CommonJS-ish
    // shape is fragile — instead assert the code wiring that guarantees the
    // runtime behavior (default injection before the merge, consumption in
    // both createApp/createSSRApp).
    const code = await mod.load();
    // Default injection happens inside resolveAppConfig before the merge.
    expect(code).toMatch(/if \(_rootApp\) base\.appRoot = _rootApp;/);
    // Both factories consume config.appRoot (single source of truth).
    expect(code).toContain('appRoot: config.appRoot');
  });

  it('explicit appRoot overrides file fallback via merge (last-wins)', () => {
    // The virtual module's `_mergeAppConfig` is the JS twin of the TS
    // `mergeAppConfig` in @ubean/client/define-app. Both must treat appRoot
    // as a scalar field overridden by later configs (last-wins) — not
    // accumulated like plugins/router.setup.
    // The generated code for the merge branch is what we lock here:
    const mod = createVueAppEntryVirtualModule(makeEntry(true));
    const code = mod.load();
    expect(code).toContain('if (cfg.appRoot) result.appRoot = cfg.appRoot;');
  });
});
