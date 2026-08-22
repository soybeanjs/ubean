/**
 * Nested Layouts (multi-level) — extraction unit tests
 *
 * Covers `extractDefinePageFromCode` parsing of:
 * - Array layout: `layout: ['default', 'admin', 'dashboard']`
 * - Single string layout (backward compat): `layout: 'admin'`
 * - `layout: false` (disable layout)
 * - 'default' handling (single string → undefined; array → kept as literal name)
 * - Invalid entry filtering in arrays
 */
import { describe, it, expect } from 'vitest';
import { extractDefinePageFromCode } from '../src/extract-page';

describe('extractDefinePageFromCode — nested layouts', () => {
  it('extracts array layout from definePage', () => {
    const code = `
<script setup>
definePage({
  layout: ['default', 'admin', 'dashboard']
});
</script>
<template><div>test</div></template>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    expect(meta!.layout).toEqual(['default', 'admin', 'dashboard']);
  });

  it('extracts single string layout (backward compat)', () => {
    const code = `
<script setup>
definePage({ layout: 'admin' });
</script>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    expect(meta!.layout).toBe('admin');
  });

  it('extracts layout: false', () => {
    const code = `
<script setup>
definePage({ layout: false });
</script>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    expect(meta!.layout).toBe(false);
  });

  it('keeps "default" in array layout (literal layout name)', () => {
    const code = `
<script setup>
definePage({ layout: ['default', 'admin'] });
</script>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    // 'default' inside an array is a literal layout name, not filtered
    expect(meta!.layout).toEqual(['default', 'admin']);
  });

  it('filters out invalid entries from array layout', () => {
    const code = `
<script setup>
definePage({ layout: ['admin', 123, null, 'dashboard'] });
</script>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    expect(meta!.layout).toEqual(['admin', 'dashboard']);
  });

  it('returns undefined for layout: "default" (single string)', () => {
    const code = `
<script setup>
definePage({ layout: 'default' });
</script>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    expect(meta!.layout).toBeUndefined();
  });

  it('returns undefined when layout is not specified', () => {
    const code = `
<script setup>
definePage({ name: 'test' });
</script>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    expect(meta!.layout).toBeUndefined();
  });

  it('handles single-element array', () => {
    const code = `
<script setup>
definePage({ layout: ['admin'] });
</script>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    expect(meta!.layout).toEqual(['admin']);
  });

  it('handles empty array (results in undefined)', () => {
    const code = `
<script setup>
definePage({ layout: [] });
</script>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    // Empty array after filtering produces no layouts
    expect(meta!.layout).toBeUndefined();
  });

  it('handles array with only "default" (kept as literal)', () => {
    const code = `
<script setup>
definePage({ layout: ['default'] });
</script>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    // 'default' in array is a literal layout name, kept as-is
    expect(meta!.layout).toEqual(['default']);
  });

  it('handles two-element array without "default"', () => {
    const code = `
<script setup>
definePage({ layout: ['admin', 'dashboard'] });
</script>
`;
    const meta = extractDefinePageFromCode(code);
    expect(meta).not.toBeNull();
    expect(meta!.layout).toEqual(['admin', 'dashboard']);
  });
});

describe('extractDefinePageFromCode — select SSR', () => {
  it('extracts ssr: data-only', () => {
    const meta = extractDefinePageFromCode(`
<script setup>
definePage({ ssr: 'data-only' });
</script>
`);
    expect(meta?.ssr).toBe('data-only');
  });

  it('extracts ssr: false', () => {
    const meta = extractDefinePageFromCode(`
<script setup>
definePage({ ssr: false });
</script>
`);
    expect(meta?.ssr).toBe(false);
  });
});
