import { describe, it, expect } from 'vitest';
import { createVueAppEntryVirtualModule } from '../src/vue-virtual-modules';

describe('createVueAppEntryVirtualModule islands hydration', () => {
  it('skips the second afterEach rAF unless pending islands exist', async () => {
    const code = await createVueAppEntryVirtualModule().load();
    expect(code).toContain('hasPendingIslands');
    expect(code).toContain('scheduleIslandHydration');
    expect(code).toContain('forceDoubleFrame: true');
    expect(code).toContain('instance.router.afterEach');
    expect(code).not.toContain('doHydrateIslands');
  });
});
