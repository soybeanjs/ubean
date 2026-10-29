/**
 * Pinia auto-registration — `pinia: true` in `ubean.config.ts` must wire the
 * plugin and the SSR state hooks by itself, so users no longer hand-write
 * `plugins: [createPinia()]` + `serializeState`/`hydrateState` in `src/app.ts`.
 *
 * Three invariants matter:
 * 1. off (`pinia: false` / `enabled: false` / `disabled: true`) generates
 *    nothing — the module stays byte-identical to the pre-feature output and
 *    `pinia` never enters the client graph;
 * 2. on, the hooks land on `base` (before the merge) so an explicit
 *    `defineApp({ serializeState })` still wins;
 * 3. on, the install is guarded by `$pinia` so a user who already wrote
 *    `plugins: [createPinia()]` does not get a second instance, and it runs
 *    before `hydrateState` (otherwise hydration finds no instance);
 * 4. on, `defineApp({ pinia: { setup } })` runs on the instance before
 *    `app.use()` — that is where `pinia.use(plugin)` belongs.
 */
import { describe, it, expect } from 'vitest';
import { createVueAppEntryVirtualModule } from '../src/vue-virtual-modules';

const load = async (pinia: boolean | { enabled?: boolean; disabled?: boolean }) =>
  (await createVueAppEntryVirtualModule(undefined, { pinia }).load())!;

describe('createVueAppEntryVirtualModule — pinia auto-registration', () => {
  it('off by default: no pinia import, no hooks, no install', async () => {
    const code = await createVueAppEntryVirtualModule(undefined).load();
    expect(code).not.toContain("from 'pinia'");
    expect(code).not.toContain('serializePiniaState');
    expect(code).not.toContain('createPinia()');
  });

  it.each([
    ['false', false],
    ['enabled: false', { enabled: false }],
    ['disabled: true', { disabled: true }]
  ])('off when %s', async (_label, value) => {
    const code = await load(value as boolean | { enabled?: boolean; disabled?: boolean });
    expect(code).not.toContain('createPinia()');
  });

  it('on: imports pinia + the integrations runtime', async () => {
    const code = await load(true);
    expect(code).toContain("import { createPinia } from 'pinia';");
    expect(code).toContain(
      "import { serializePiniaState, hydratePiniaState } from '@ubean/integrations/pinia/runtime';"
    );
  });

  it('on: hooks are set on base, before the merge (user config still wins)', async () => {
    const code = await load(true);
    const baseIdx = code.indexOf('const base = createDefaultAppConfig();');
    const hookIdx = code.indexOf('base.serializeState = serializePiniaState;');
    const mergeIdx = code.indexOf('_mergeAppConfig(base, sharedCfg');
    expect(baseIdx).toBeGreaterThan(-1);
    expect(hookIdx).toBeGreaterThan(baseIdx);
    expect(mergeIdx).toBeGreaterThan(hookIdx);
  });

  it('on: install is a plugin appended AFTER the merge (user plugins run first)', async () => {
    const code = await load(true);
    // The guard must be appended to the merged config, not to base.plugins —
    // otherwise it would run before a user's own createPinia() and install a
    // second instance.
    expect(code).toMatch(
      /function _withPinia\(config\) \{[\s\S]*config\.plugins = \[\.\.\.\(config\.plugins \|\| \[\]\)/
    );
    // Entries are `{ plugin }` wrappers — applyAppConfig destructures `{ plugin, mode }`.
    expect(code).toContain('{ plugin: { install(app) {');
    expect(code).toContain('return _withPinia(merged);');
    // Both resolveAppConfig exits wrap, including the no-app.ts early return.
    expect(code).toContain('return _withPinia(base);');
    expect(code).not.toMatch(/\n\s*return base;/);
    expect(code).not.toMatch(/\n\s*return merged;/);
  });

  it('on: install is guarded by $pinia (no second instance when the user already has one)', async () => {
    const code = await load(true);
    expect(code).toContain('const existing = app.config.globalProperties.$pinia;');
    expect(code).toContain('if (!existing) app.use(instance);');
  });

  it('on: setup hooks run on the instance before app.use()', async () => {
    const code = await load(true);
    expect(code).toContain('const setups = config.pinia && config.pinia.setup ? [config.pinia.setup] : [];');
    const setupRun = code.indexOf('for (const setup of setups) setup(instance);');
    const use = code.indexOf('if (!existing) app.use(instance);');
    expect(setupRun).toBeGreaterThan(-1);
    expect(use).toBeGreaterThan(setupRun);
  });

  it('on: setup targets the user instance when one is already installed', async () => {
    const code = await load(true);
    expect(code).toContain('const instance = existing || createPinia();');
  });

  it('on: setup hooks accumulate across configs (shared first)', async () => {
    const code = await load(true);
    expect(code).toContain('prev.setup(pinia); cfg.pinia.setup(pinia);');
  });

  it('on: install runs through applyAppConfig, which precedes hydrateState', async () => {
    const code = await load(true);
    const apply = code.indexOf("applyAppConfig(instance.app, config, 'client');");
    const hydrate = code.indexOf('config.hydrateState(instance.app, state)');
    expect(apply).toBeGreaterThan(-1);
    expect(hydrate).toBeGreaterThan(apply);
  });

  it('on: object form without enabled/disabled still enables', async () => {
    const code = await load({});
    expect(code).toContain('createPinia()');
  });
});
