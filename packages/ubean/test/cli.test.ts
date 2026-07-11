import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderTemplate,
  toKebabCase,
  toPascalCase,
  toCamelCase,
  renderPageTemplate,
  renderApiTemplate,
  renderMiddlewareTemplate,
  renderLayoutTemplate,
  renderCronTemplate,
  renderPluginTemplate,
  createFsOps
} from '../src/core/cli/shared';
import { scaffold, deleteScaffold, recoverScaffold } from '../src/core/cli/page';

describe('template rendering', () => {
  it('renders simple variables', () => {
    const result = renderTemplate('Hello {{name}}!', { variables: { name: 'World' } });
    expect(result).toBe('Hello World!');
  });

  it('renders multiple variables', () => {
    const result = renderTemplate('{{greeting}} {{name}}!', {
      variables: { greeting: 'Hi', name: 'there' }
    });
    expect(result).toBe('Hi there!');
  });

  it('supports nested property access', () => {
    const result = renderTemplate('{{user.name}} - {{user.age}}', {
      variables: { user: { name: 'Alice', age: 30 } }
    });
    expect(result).toBe('Alice - 30');
  });

  it('leaves undefined variables as-is', () => {
    const result = renderTemplate('Hello {{name}}, your id is {{id}}', {
      variables: { name: 'Bob' }
    });
    expect(result).toBe('Hello Bob, your id is {{id}}');
  });

  it('supports custom delimiters', () => {
    const result = renderTemplate('Hello <% name %>!', {
      variables: { name: 'World' },
      delimiters: ['<%', '%>']
    });
    expect(result).toBe('Hello World!');
  });

  it('handles whitespace in variable tags', () => {
    const result = renderTemplate('{{  name  }}', { variables: { name: 'test' } });
    expect(result).toBe('test');
  });
});

describe('case conversion', () => {
  it('toKebabCase converts various formats', () => {
    expect(toKebabCase('HelloWorld')).toBe('hello-world');
    expect(toKebabCase('hello_world')).toBe('hello-world');
    expect(toKebabCase('Hello World')).toBe('hello-world');
    expect(toKebabCase('my-component')).toBe('my-component');
  });

  it('toPascalCase converts various formats', () => {
    expect(toPascalCase('hello-world')).toBe('HelloWorld');
    expect(toPascalCase('hello_world')).toBe('HelloWorld');
    expect(toPascalCase('hello world')).toBe('HelloWorld');
    expect(toPascalCase('HelloWorld')).toBe('HelloWorld');
  });

  it('toCamelCase converts to camelCase', () => {
    expect(toCamelCase('hello-world')).toBe('helloWorld');
    expect(toCamelCase('HelloWorld')).toBe('helloWorld');
  });
});

describe('template generators', () => {
  it('renderPageTemplate includes name and kebab case', () => {
    const result = renderPageTemplate({ name: 'UserProfile', path: '/users/profile', kebabName: '', pascalName: '', camelName: '' });
    expect(result).toContain('UserProfile');
    expect(result).toContain('user-profile-page');
  });

  it('renderApiTemplate includes endpoint name', () => {
    const result = renderApiTemplate({ name: 'users', method: 'GET', path: '/api/users', kebabName: '' });
    expect(result).toContain('users');
    expect(result).toContain('defineHandler');
  });

  it('renderMiddlewareTemplate includes middleware name', () => {
    const result = renderMiddlewareTemplate({ name: 'auth', path: '/middleware/auth', global: false });
    expect(result).toContain('auth');
    expect(result).toContain('defineMiddleware');
  });

  it('renderLayoutTemplate includes layout class', () => {
    const result = renderLayoutTemplate({ name: 'AdminLayout', path: '/layouts/admin', pascalName: '' });
    expect(result).toContain('admin-layout');
    expect(result).toContain('definePage');
  });

  it('renderCronTemplate includes schedule and name', () => {
    const result = renderCronTemplate({ name: 'dailyCleanup', schedule: '0 0 * * *', kebabName: '' });
    expect(result).toContain('dailyCleanup');
    expect(result).toContain('0 0 * * *');
    expect(result).toContain('defineScheduled');
  });

  it('renderPluginTemplate includes plugin name', () => {
    const result = renderPluginTemplate({ name: 'myPlugin', kebabName: '', pascalName: '' });
    expect(result).toContain('my-plugin');
    expect(result).toContain('definePlugin');
  });
});

describe('fs-ops', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ubean-cli-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates fs-ops instance with cwd', () => {
    const fs = createFsOps(tmpDir);
    expect(fs.cwd).toBe(tmpDir);
  });

  it('resolves paths relative to cwd', () => {
    const fs = createFsOps(tmpDir);
    expect(fs.resolve('test.txt')).toBe(join(tmpDir, 'test.txt'));
    expect(fs.resolve('sub', 'file.ts')).toBe(join(tmpDir, 'sub', 'file.ts'));
  });

  it('writes and reads files', async () => {
    const fs = createFsOps(tmpDir);
    await fs.writeFile('hello.txt', 'Hello World');
    const content = await fs.readFile('hello.txt');
    expect(content).toBe('Hello World');
  });

  it('creates parent directories when writing files', async () => {
    const fs = createFsOps(tmpDir);
    await fs.writeFile('deep/nested/dir/file.txt', 'nested content');
    const content = await fs.readFile('deep/nested/dir/file.txt');
    expect(content).toBe('nested content');
  });

  it('checks file existence', async () => {
    const fs = createFsOps(tmpDir);
    expect(await fs.exists('missing.txt')).toBe(false);
    await fs.writeFile('exists.txt', 'yes');
    expect(await fs.exists('exists.txt')).toBe(true);
  });

  it('writes and reads JSON', async () => {
    const fs = createFsOps(tmpDir);
    const data = { name: 'test', value: 42 };
    await fs.writeJson('data.json', data);
    const read = await fs.readJson<typeof data>('data.json');
    expect(read).toEqual(data);
  });

  it('creates backup of existing file', async () => {
    const fs = createFsOps(tmpDir);
    await fs.writeFile('original.txt', 'original content');
    const backupPath = await fs.createBackup('original.txt');
    expect(backupPath).toBeTruthy();
    expect(await fs.exists('original.txt.bak')).toBe(true);
    const backupContent = await fs.readFile('original.txt.bak');
    expect(backupContent).toBe('original content');
  });

  it('returns null when backing up non-existent file', async () => {
    const fs = createFsOps(tmpDir);
    const result = await fs.createBackup('nonexistent.txt');
    expect(result).toBeNull();
  });

  it('removes files', async () => {
    const fs = createFsOps(tmpDir);
    await fs.writeFile('to-remove.txt', 'delete me');
    expect(await fs.exists('to-remove.txt')).toBe(true);
    await fs.remove('to-remove.txt');
    expect(await fs.exists('to-remove.txt')).toBe(false);
  });

  it('ensures directories exist', async () => {
    const fs = createFsOps(tmpDir);
    await fs.ensureDir('new/sub/dir');
    expect(await fs.exists('new/sub/dir')).toBe(true);
  });

  it('sync existence check works', () => {
    const fs = createFsOps(tmpDir);
    expect(fs.existsSync('.')).toBe(true);
  });

  it('copyFile copies content', async () => {
    const fs = createFsOps(tmpDir);
    await fs.writeFile('src.txt', 'source');
    await fs.copyFile('src.txt', 'dest.txt');
    expect(await fs.readFile('dest.txt')).toBe('source');
  });
});

describe('scaffold', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ubean-scaffold-test-'));
    await mkdir(join(tmpDir, 'src', 'pages'), { recursive: true });
    await mkdir(join(tmpDir, 'src', 'api'), { recursive: true });
    await mkdir(join(tmpDir, 'src', 'middleware'), { recursive: true });
    await mkdir(join(tmpDir, 'src', 'layouts'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a page .vue file', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'about'
    });

    expect(result.errors).toHaveLength(0);
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toContain('about.vue');
    expect(result.created[0]).toContain('pages');
  });

  it('creates a nested page file', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'users/[id]'
    });

    expect(result.errors).toHaveLength(0);
    expect(result.created[0]).toContain('[id].vue');
  });

  it('creates index page for root path', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'page',
      path: '/'
    });

    expect(result.errors).toHaveLength(0);
    expect(result.created[0]).toContain('index.vue');
  });

  it('creates API route .ts file', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'api',
      path: 'users',
      method: 'GET'
    });

    expect(result.errors).toHaveLength(0);
    expect(result.created[0]).toContain('users.ts');
    expect(result.created[0]).toContain('api');
  });

  it('creates middleware file', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'middleware',
      path: 'auth'
    });

    expect(result.errors).toHaveLength(0);
    expect(result.created[0]).toContain('auth.ts');
    expect(result.created[0]).toContain('middleware');
  });

  it('creates layout file', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'layout',
      path: 'default'
    });

    expect(result.errors).toHaveLength(0);
    expect(result.created[0]).toContain('default.vue');
    expect(result.created[0]).toContain('layouts');
  });

  it('skips existing files without --force', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    const result = await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });

    expect(result.skipped).toHaveLength(1);
    expect(result.created).toHaveLength(0);
  });

  it('overwrites existing files with --force and creates backup', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    const result = await scaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'about',
      force: true
    });

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    const fs = createFsOps(tmpDir);
    expect(await fs.exists('src/pages/about.vue.bak')).toBe(true);
  });

  it('dry-run does not create files', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'contact',
      dry: true
    });

    expect(result.created).toHaveLength(1);

    const fs = createFsOps(tmpDir);
    expect(await fs.exists('src/pages/contact.vue')).toBe(false);
  });

  it('generated page content contains definePage', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    const fs = createFsOps(tmpDir);
    const content = await fs.readFile('src/pages/about.vue');
    expect(content).toContain('definePage');
    expect(content).toContain('About');
  });

  it('generated API content contains defineHandler', async () => {
    await scaffold({ cwd: tmpDir, type: 'api', path: 'users' });
    const fs = createFsOps(tmpDir);
    const content = await fs.readFile('src/api/users.ts');
    expect(content).toContain('defineHandler');
  });

  it('generated middleware content contains defineMiddleware', async () => {
    await scaffold({ cwd: tmpDir, type: 'middleware', path: 'auth' });
    const fs = createFsOps(tmpDir);
    const content = await fs.readFile('src/middleware/auth.ts');
    expect(content).toContain('defineMiddleware');
  });

  it('creates reuse page .reuse.ts file', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'reuse',
      path: 'users/[id]'
    });

    expect(result.errors).toHaveLength(0);
    expect(result.created[0]).toContain('[id].reuse.ts');
    expect(result.created[0]).toContain('pages');

    const fs = createFsOps(tmpDir);
    const content = await fs.readFile(result.created[0].replace(tmpDir + '/', ''));
    expect(content).toContain('definePage');
    expect(content).toContain("import { definePage } from 'ubean'");
    expect(content).toContain('UsersId');
  });

  it('creates reuse index page', async () => {
    const result = await scaffold({
      cwd: tmpDir,
      type: 'reuse',
      path: '/'
    });
    expect(result.errors).toHaveLength(0);
    expect(result.created[0]).toContain('index.reuse.ts');
  });

  it('deleteScaffold removes file and creates backup by default', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    const fs = createFsOps(tmpDir);
    expect(await fs.exists('src/pages/about.vue')).toBe(true);

    const result = await deleteScaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'about'
    });

    expect(result.deleted).toHaveLength(1);
    expect(await fs.exists('src/pages/about.vue')).toBe(false);
    expect(await fs.exists('src/pages/about.vue.bak')).toBe(true);
  });

  it('deleteScaffold permanently removes with --force (no backup)', async () => {
    await scaffold({ cwd: tmpDir, type: 'api', path: 'users' });
    const fs = createFsOps(tmpDir);
    expect(await fs.exists('src/api/users.ts')).toBe(true);

    const result = await deleteScaffold({
      cwd: tmpDir,
      type: 'api',
      path: 'users',
      force: true
    });

    expect(result.deleted).toHaveLength(1);
    expect(await fs.exists('src/api/users.ts')).toBe(false);
    expect(await fs.exists('src/api/users.ts.bak')).toBe(false);
  });

  it('deleteScaffold returns error for non-existent files', async () => {
    const result = await deleteScaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'nonexistent'
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('deleteScaffold dry-run does not delete files', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'test' });
    const fs = createFsOps(tmpDir);
    const result = await deleteScaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'test',
      dry: true
    });
    expect(result.deleted).toHaveLength(1);
    expect(await fs.exists('src/pages/test.vue')).toBe(true);
  });

  it('recoverScaffold restores from backup', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'about' });
    await deleteScaffold({ cwd: tmpDir, type: 'page', path: 'about' });

    const fs = createFsOps(tmpDir);
    expect(await fs.exists('src/pages/about.vue')).toBe(false);
    expect(await fs.exists('src/pages/about.vue.bak')).toBe(true);

    const result = await recoverScaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'about'
    });

    expect(result.restored).toHaveLength(1);
    expect(await fs.exists('src/pages/about.vue')).toBe(true);
    expect(await fs.exists('src/pages/about.vue.bak')).toBe(false);
  });

  it('recoverScaffold returns error when no backup exists', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'new' });
    const result = await recoverScaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'new'
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.restored).toHaveLength(0);
  });

  it('recoverScaffold dry-run checks for backup existence', async () => {
    await scaffold({ cwd: tmpDir, type: 'page', path: 'torecover' });
    await deleteScaffold({ cwd: tmpDir, type: 'page', path: 'torecover' });

    const result = await recoverScaffold({
      cwd: tmpDir,
      type: 'page',
      path: 'torecover',
      dry: true
    });
    expect(result.restored).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });
});
