/**
 * @ubean/scan 聚合扫描测试(scanProject)。
 *
 * 页面/布局扫描逻辑的完整测试已随所有权迁移至 `@ubean/vue`
 * (special-pages-and-reuse / parallel-intercept 等)。此处验证聚合层
 * 自身职责:API 路由/中间件扫描 + 页面扫描委托(`@ubean/vue` 的
 * `scanPages`,框架模式 markdown/head 默认开启)。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanProject } from '../src/scan';

let tmpDir: string;
let srcDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ubean-routing-scan-'));
  srcDir = join(tmpDir, 'src');
  mkdirSync(join(srcDir, 'pages'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
  const full = join(srcDir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

async function scan() {
  return scanProject({ cwd: tmpDir, srcDir: 'src' });
}

describe('scanProject — 聚合扫描', () => {
  it('页面扫描委托 @ubean/vue:pages/layouts/notFoundPage 透传', async () => {
    writeFile('pages/index.vue', '<template>Home</template>');
    writeFile('pages/about.vue', '<template>About</template>');
    writeFile('pages/404.vue', '<template>404</template>');
    writeFile('layouts/default.vue', '<template><slot /></template>');
    const result = await scan();
    expect(result.pages.map(p => p.route).sort()).toEqual(['/', '/about']);
    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0].name).toBe('default');
    expect(result.notFoundPage?.name).toBe('NotFound');
  });

  it('API 路由扫描:方法后缀 + defineHandler 导出检测', async () => {
    writeFile('routes/users.get.ts', `import { defineHandler } from '@ubean/routes';\nexport const GET = defineHandler(async ctx => ctx.json({}));\n`);
    const result = await scan();
    expect(result.apiRoutes).toHaveLength(1);
    expect(result.apiRoutes[0].route).toBe('/users');
    expect(result.apiRoutes[0].method).toBe('get');
  });

  it('中间件扫描:global 前缀目录挂载', async () => {
    writeFile('middleware/global.auth.ts', `export default async (ctx, next) => { await next(); };`);
    writeFile('middleware/10.logger.ts', `export default async (ctx, next) => { await next(); };`);
    const result = await scan();
    expect(result.middlewares).toHaveLength(2);
    const auth = result.middlewares.find(m => m.basename.startsWith('global.auth'));
    const logger = result.middlewares.find(m => m.basename.startsWith('10.logger'));
    expect(auth?.global).toBe(true);
    expect(logger?.global).toBe(false);
    expect(logger?.order).toBe(10);
  });

  it('markdown 默认开启(框架模式):.md 页面被扫描', async () => {
    writeFile('pages/guide.md', `# Guide\n\ncontent`);
    const result = await scan();
    expect(result.pages.find(p => p.route === '/guide')?.isMarkdown).toBe(true);
  });
});
