import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scaffoldProject } from '../src/core/cli/init';

describe('ubean init', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ubean-init-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    delete process.env.NONINTERACTIVE;
  });

  it('scaffolds a starter project with default options', async () => {
    await scaffoldProject({
      cwd: tmpDir,
      dir: '.',
      force: false,
      template: 'starter',
      preset: 'standard',
      packageManager: 'npm',
      git: false,
      name: 'test-app'
    });

    expect(existsSync(join(tmpDir, 'package.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'ubean.config.ts'))).toBe(true);
    expect(existsSync(join(tmpDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(tmpDir, 'README.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/app.vue'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/layouts/default.vue'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/pages/index.vue'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/pages/about.vue'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/routes/hello.get.ts'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/components'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/composables'))).toBe(true);
    expect(existsSync(join(tmpDir, 'public'))).toBe(true);
  });

  it('generates package.json with correct project name', async () => {
    await scaffoldProject({
      cwd: tmpDir,
      dir: '.',
      force: false,
      name: 'my-project',
      packageManager: 'pnpm',
      git: false
    });

    const pkg = JSON.parse(await readFile(join(tmpDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('my-project');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
    expect(pkg.scripts.dev).toBe('ubean dev');
    expect(pkg.scripts.build).toBe('ubean build');
    expect(pkg.dependencies.vue).toBeDefined();
    expect(pkg.dependencies.ubean).toBeDefined();
  });

  it('generates README with correct package manager commands', async () => {
    await scaffoldProject({
      cwd: tmpDir,
      dir: '.',
      force: false,
      name: 'test',
      packageManager: 'pnpm',
      git: false
    });

    const readme = await readFile(join(tmpDir, 'README.md'), 'utf-8');
    expect(readme).toContain('# test');
    expect(readme).toContain('pnpm install');
    expect(readme).toContain('pnpm dev');
    expect(readme).toContain('pnpm build');
  });

  it('generates ubean.config.ts with preset', async () => {
    await scaffoldProject({
      cwd: tmpDir,
      dir: '.',
      force: false,
      preset: 'cloudflare',
      name: 'cf-app',
      git: false,
      packageManager: 'npm'
    });

    const config = await readFile(join(tmpDir, 'ubean.config.ts'), 'utf-8');
    expect(config).toContain("preset: 'cloudflare'");
  });

  it('scaffolds minimal template', async () => {
    await scaffoldProject({
      cwd: tmpDir,
      dir: '.',
      force: false,
      template: 'minimal',
      name: 'mini',
      git: false,
      packageManager: 'npm'
    });

    expect(existsSync(join(tmpDir, 'src/pages/index.vue'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/pages/about.vue'))).toBe(false);
    expect(existsSync(join(tmpDir, 'src/routes/hello.get.ts'))).toBe(false);
  });

  it('scaffolds blog template with markdown post', async () => {
    await scaffoldProject({
      cwd: tmpDir,
      dir: '.',
      force: false,
      template: 'blog',
      name: 'my-blog',
      git: false,
      packageManager: 'npm'
    });

    expect(existsSync(join(tmpDir, 'src/pages/index.vue'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/pages/about.vue'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/pages/blog/index.vue'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/pages/blog/hello-world.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src/routes/hello.get.ts'))).toBe(true);

    const blogPost = await readFile(join(tmpDir, 'src/pages/blog/hello-world.md'), 'utf-8');
    expect(blogPost).toContain('title: Hello World');
    expect(blogPost).toContain('# Hello World');
  });

  it('creates project in subdirectory', async () => {
    await scaffoldProject({
      cwd: tmpDir,
      dir: 'my-app',
      force: false,
      name: 'nested-app',
      git: false,
      packageManager: 'npm'
    });

    const appDir = join(tmpDir, 'my-app');
    expect(existsSync(join(appDir, 'package.json'))).toBe(true);
    expect(existsSync(join(appDir, 'src/pages/index.vue'))).toBe(true);

    const pkg = JSON.parse(await readFile(join(appDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('nested-app');
  });

  it('creates proper .gitignore', async () => {
    await scaffoldProject({
      cwd: tmpDir,
      dir: '.',
      force: false,
      name: 'gitignore-test',
      git: false,
      packageManager: 'npm'
    });

    const gitignore = await readFile(join(tmpDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('dist');
    expect(gitignore).toContain('.ubean');
    expect(gitignore).toContain('.env');
  });

  it('generates tsconfig.json with proper settings', async () => {
    await scaffoldProject({
      cwd: tmpDir,
      dir: '.',
      force: false,
      name: 'ts-test',
      git: false,
      packageManager: 'npm'
    });

    const tsconfig = JSON.parse(await readFile(join(tmpDir, 'tsconfig.json'), 'utf-8'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.moduleResolution).toBe('Bundler');
    expect(tsconfig.compilerOptions.types).toContain('ubean/client');
  });

  it('defaults to directory name when no name provided', async () => {
    const subDir = 'inferred-name';
    await scaffoldProject({
      cwd: tmpDir,
      dir: subDir,
      force: false,
      git: false,
      packageManager: 'npm'
    });

    const pkg = JSON.parse(await readFile(join(tmpDir, subDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe(subDir);
  });

  it('creates proper directory structure', async () => {
    await scaffoldProject({
      cwd: tmpDir,
      dir: '.',
      force: false,
      name: 'struct-test',
      git: false,
      packageManager: 'npm'
    });

    const srcFiles = await readdir(join(tmpDir, 'src'));
    expect(srcFiles).toContain('pages');
    expect(srcFiles).toContain('layouts');
    expect(srcFiles).toContain('routes');
    expect(srcFiles).toContain('components');
    expect(srcFiles).toContain('composables');
    expect(srcFiles).toContain('plugins');
    expect(srcFiles).toContain('app.vue');
  });

  it('throws in non-interactive mode when directory not empty and no force', async () => {
    await writeFile(join(tmpDir, 'existing.txt'), 'existing');

    await expect(
      scaffoldProject({
        cwd: tmpDir,
        dir: '.',
        force: false,
        name: 'fail-test',
        git: false,
        packageManager: 'npm'
      })
    ).rejects.toThrow('not empty');
  });
});
