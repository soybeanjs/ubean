import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractDefineMetaFromCode } from '../src/define-page';

describe('defineHandlerMeta 提取 — warn 定位', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('不可求值的字段带文件名与行号', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    extractDefineMetaFromCode(
      `import { defineHandlerMeta } from 'ubean/server';\n\nexport const GET = defineHandlerMeta({ requiresAuth: isAuthed() });`,
      '/proj/src/routes/api/users.ts'
    );
    const message = spy.mock.calls[0][0] as string;
    expect(message).toContain('/proj/src/routes/api/users.ts:3:');
    expect(message).toContain('`requiresAuth`');
    expect(message).toContain('函数调用');
  });

  it('只丢掉出问题的字段，meta 照常保留', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = extractDefineMetaFromCode(
      `defineHandlerMeta({ requiresAuth: isAuthed(), meta: { group: 'users' } });`,
      '/proj/src/routes/api/users.ts'
    );
    expect(result).toEqual({ meta: { group: 'users' } });
  });

  it('不传文件名时不报定位（但仍 warn）', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    extractDefineMetaFromCode(`defineHandlerMeta({ rateLimit: getLimit() });`);
    expect(spy.mock.calls[0][0]).toContain('[ubean/vue] defineHandlerMeta():');
  });
});
