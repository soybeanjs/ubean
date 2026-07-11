import { describe, it, expect } from 'vitest';
import { filePathToRoute } from '../src/utils/path';
import { createUbeanRouter } from '../src/core/routing/router';
import { definePreset, resolvePreset } from '../src/core/preset/_utils/preset';
import { extractDefinePageFromCode, extractDefineValidatorFromCode, extractDefineMetaFromCode } from '../src/core/routing/define-page';
import { detectHttpExportsFromCode } from '../src/core/routing/detect-exports';
import { generateRouteName, generateLayoutName } from '../src/core/routing/route-name';

describe('filePathToRoute', () => {
  it('converts index to /', () => {
    expect(filePathToRoute('index').route).toBe('/');
  });

  it('converts nested path', () => {
    expect(filePathToRoute('users/index').route).toBe('/users');
  });

  it('converts dynamic param', () => {
    const result = filePathToRoute('users/[id]');
    expect(result.route).toBe('/users/:id');
  });

  it('converts catch-all param', () => {
    const result = filePathToRoute('files/[...path]');
    expect(result.route).toBe('/files/**:path');
  });

  it('strips route groups', () => {
    const result = filePathToRoute('(auth)/login');
    expect(result.route).toBe('/login');
  });

  it('extracts HTTP method suffix', () => {
    const result = filePathToRoute('users/[id].get');
    expect(result.route).toBe('/users/:id');
    expect(result.method).toBe('get');
  });

  it('extracts env suffix', () => {
    const result = filePathToRoute('health.dev');
    expect(result.route).toBe('/health');
    expect(result.env).toBe('dev');
  });
});

describe('generateRouteName', () => {
  it('generates index name for root', () => {
    expect(generateRouteName('/')).toBe('index');
  });

  it('generates pascal case name', () => {
    expect(generateRouteName('/users')).toBe('Users');
  });

  it('handles nested routes', () => {
    expect(generateRouteName('/users/profile')).toBe('UsersProfile');
  });

  it('handles dynamic params', () => {
    expect(generateRouteName('/users/[id]')).toBe('UsersId');
  });

  it('handles kebab-case segments', () => {
    expect(generateRouteName('/user-profile')).toBe('UserProfile');
  });

  it('skips route groups', () => {
    expect(generateRouteName('/(auth)/login')).toBe('Login');
  });
});

describe('generateLayoutName', () => {
  it('default layout', () => {
    expect(generateLayoutName('default.vue')).toBe('default');
  });

  it('named layout', () => {
    expect(generateLayoutName('landing.vue')).toBe('Landing');
  });

  it('nested layout', () => {
    expect(generateLayoutName('admin/dashboard.vue')).toBe('AdminDashboard');
  });
});

describe('detectHttpExportsFromCode', () => {
  it('detects GET and POST exports', () => {
    const code = `
      export async function GET(c) { return new Response('ok'); }
      export const POST = async (c) => { return new Response('created', { status: 201 }); };
    `;
    const result = detectHttpExportsFromCode(code);
    expect(result.httpMethods).toContain('get');
    expect(result.httpMethods).toContain('post');
  });

  it('detects defineMeta usage', () => {
    const code = `
      import { defineHandler, defineMeta } from 'ubean';
      export default defineHandler(defineMeta({ public: true }), () => new Response('ok'));
    `;
    const result = detectHttpExportsFromCode(code);
    expect(result.hasMeta).toBe(true);
  });

  it('detects defineValidator usage', () => {
    const code = `
      import { defineHandler, defineValidator } from 'ubean';
      export default defineHandler(defineValidator({}), () => new Response('ok'));
    `;
    const result = detectHttpExportsFromCode(code);
    expect(result.hasValidator).toBe(true);
  });
});

describe('extractDefinePageFromCode', () => {
  it('extracts layout config', () => {
    const code = `definePage({ layout: 'landing', name: 'Home' })`;
    const meta = extractDefinePageFromCode(code);
    expect(meta?.layout).toBe('landing');
    expect(meta?.name).toBe('Home');
  });

  it('extracts public flag', () => {
    const code = `definePage({ public: false })`;
    const meta = extractDefinePageFromCode(code);
    expect(meta?.public).toBe(false);
  });

  it('returns null when no definePage', () => {
    const code = `const x = 1;`;
    expect(extractDefinePageFromCode(code)).toBeNull();
  });
});

describe('extractDefineMetaFromCode', () => {
  it('extracts public flag', () => {
    const code = `defineMeta({ public: false })`;
    const result = extractDefineMetaFromCode(code);
    expect(result?.public).toBe(false);
  });

  it('extracts openAPI config', () => {
    const code = `defineMeta({ openAPI: { tags: ['users'], summary: 'Get user' } })`;
    const result = extractDefineMetaFromCode(code);
    expect(result?.openAPI).toBeDefined();
    expect((result?.openAPI as any)?.tags).toContain('users');
  });

  it('extracts extra fields as meta', () => {
    const code = `defineMeta({ rateLimit: { maxRequests: 100, windowSeconds: 60 } })`;
    const result = extractDefineMetaFromCode(code);
    expect(result?.meta).toBeDefined();
    expect((result?.meta as any)?.rateLimit).toBeDefined();
  });

  it('returns null when no defineMeta', () => {
    const code = `const x = 1;`;
    expect(extractDefineMetaFromCode(code)).toBeNull();
  });
});

describe('extractDefineValidatorFromCode', () => {
  it('detects json validator slot', () => {
    const code = `defineValidator({ json: createSchema })`;
    const result = extractDefineValidatorFromCode(code);
    expect(result?.slots.json).toBe(true);
    expect(result?.slots.form).toBeUndefined();
  });

  it('detects multiple validator slots', () => {
    const code = `defineValidator({ json: jsonSchema, query: querySchema, param: paramSchema })`;
    const result = extractDefineValidatorFromCode(code);
    expect(result?.slots.json).toBe(true);
    expect(result?.slots.query).toBe(true);
    expect(result?.slots.param).toBe(true);
    expect(result?.slots.form).toBeUndefined();
    expect(result?.slots.header).toBeUndefined();
  });

  it('detects all validator slots', () => {
    const code = `defineValidator({ json: j, form: f, query: q, param: p, header: h, cookie: c })`;
    const result = extractDefineValidatorFromCode(code);
    expect(result?.slots.json).toBe(true);
    expect(result?.slots.form).toBe(true);
    expect(result?.slots.query).toBe(true);
    expect(result?.slots.param).toBe(true);
    expect(result?.slots.header).toBe(true);
    expect(result?.slots.cookie).toBe(true);
  });

  it('works in <script setup>', () => {
    const code = `<script setup>
    defineValidator({ json: userSchema })
    </script>`;
    const result = extractDefineValidatorFromCode(code);
    expect(result?.slots.json).toBe(true);
  });

  it('returns null when no defineValidator', () => {
    const code = `const x = 1;`;
    expect(extractDefineValidatorFromCode(code)).toBeNull();
  });
});

describe('UbeanRouter', () => {
  it('registers and matches API routes', () => {
    const router = createUbeanRouter();
    router.addApiRoute({
      fullPath: '/src/routes/users.get.ts',
      relativePath: 'users.get.ts',
      dirname: '.',
      basename: 'users.get.ts',
      route: '/users',
      method: 'get',
      exports: ['GET'],
      hasMeta: false,
      hasValidator: false
    });
    const matched = router.matchApi('GET', '/users');
    expect(matched).toBeDefined();
    expect(matched?.filePath).toContain('users.get.ts');
  });

  it('returns undefined for non-matching routes', () => {
    const router = createUbeanRouter();
    expect(router.matchApi('GET', '/nonexistent')).toBeUndefined();
  });

  it('registers pages and retrieves by name', () => {
    const router = createUbeanRouter();
    router.addPage({
      fullPath: '/src/pages/index.vue',
      relativePath: 'index.vue',
      dirname: '.',
      basename: 'index.vue',
      name: 'index',
      route: '/',
      path: '/',
      isReuse: false
    });
    expect(router.getPage('index')?.path).toBe('/');
  });

  it('registers layouts and finds default', () => {
    const router = createUbeanRouter();
    router.addLayout({
      fullPath: '/src/layouts/default.vue',
      relativePath: 'default.vue',
      dirname: '.',
      basename: 'default.vue',
      name: 'default',
      path: 'default.vue',
      isDefault: true
    });
    expect(router.getDefaultLayout()?.name).toBe('default');
  });
});

describe('definePreset', () => {
  it('registers and resolves presets', () => {
    const preset = definePreset({ name: 'test-preset' });
    expect(resolvePreset('test-preset')).toBe(preset);
  });
});
