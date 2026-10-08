/**
 * 历史事故 #4（RM-T02）—— `apps/docs` 整站 markdown 内容静默不渲染，而 CI 全绿。
 *
 * 事故现场：文档站的构建**完全不在 CI 覆盖范围内**（上次构建是手工跑的），源文件此后持续
 * 更新却无人察觉，直到发现整站正文不渲染 —— 也就是「构建命令能跑通、产物是空的」这一类。
 * 最直接的根因形态是 **SSR 期间取不到 ui 主题上下文 → 预渲染路由为 0**：站点照样构建成功，
 * `dist` 里只有几个静态壳，没有任何一条内容路由。`26de7cc` 之后 CI 才加上
 * `Build the docs site`（`pnpm --filter @ubean/docs build`）。
 *
 * 为什么这条守卫放在 `packages/cli/test/`：文档站的路由发现逻辑
 * （`apps/docs/build/docs-routes.ts`）是**纯函数**，可以直接 import 真跑，不需要先构建
 * 整个站点（完整 SSG 构建要分钟级，只适合放在 CI 步骤里）。实测 `collectPrerenderRoutes`
 * 一次调用是毫秒级，所以「路由数 > 0」这条判据能进单测层。
 *
 * 与 `packages/cli/test/ci-matrix.test.ts` 的分工：那边守「`Build the docs site` 这个
 * ubuntu-only 步骤还在」（`UBUNTU_ONLY_STEPS` 反向断言），这边守「那个步骤跑的东西真的
 * 会产出内容」—— 步骤还在但路由发现退化成 0 条，是 CI 全绿的另一种形态。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const docsDir = join(repoRoot, 'apps/docs');
const docsRoutesModule = join(docsDir, 'build/docs-routes.ts');

interface DocsRoutesModule {
  CONTENT_LOCALES: readonly string[];
  STATIC_ROUTES: string[];
  resolveContentRoutePath: (slug: string) => string;
  collectContentRoutes: (rootDir: string) => Promise<string[]>;
  collectPrerenderRoutes: (rootDir: string) => Promise<string[]>;
  collectDocsRoutes: (rootDir: string) => Promise<string[]>;
}

const routes = (await import(docsRoutesModule)) as DocsRoutesModule;

/** `apps/docs/src/content/<locale>/` 下的 `.md` 数量（含子目录）。 */
function countMarkdown(dir: string): number {
  if (!existsSync(dir)) return 0;
  const out = spawnSync('find', [dir, '-name', '*.md', '-type', 'f'], { encoding: 'utf8' });
  return out.stdout.split('\n').filter(Boolean).length;
}

describe('docs 站点的内容发现（RM-T02）', () => {
  it('预渲染路由非空且覆盖 en / zh 两侧内容', async () => {
    const prerenderRoutes = await routes.collectPrerenderRoutes(docsDir);

    // 事故的核心形态就是这条为 0：站点能构建，但没有一条内容路由。
    expect(prerenderRoutes.length, '预渲染路由为 0 —— 整站正文会静默不渲染').toBeGreaterThan(30);
    expect(prerenderRoutes).toContain('/');

    // `collectPrerenderRoutes` 只列 en 内容 + **zh 独有**内容：默认语言的 `/zh` 镜像
    // 由 SSG 的 `expandRoutes`（prefix_except_default）生成，刻意不重复列（否则清单里
    // 每条 en 路由都出现两次）。两侧都断言，防止「只发现了一半语言」。
    const enRoutes = prerenderRoutes.filter(route => route !== '/' && !route.startsWith('/zh'));
    const zhOnlyRoutes = prerenderRoutes.filter(route => route.startsWith('/zh'));
    expect(enRoutes.length).toBeGreaterThan(20);
    // zh-only 当前为 0（两侧逐 slug 对齐，由 i18n 门禁守），但镜像必须真的生成：
    // 用 `collectContentRoutes` 看全量 zh 路由，否则「zh 一条都没有」会被漏掉。
    expect(zhOnlyRoutes.length).toBeGreaterThanOrEqual(0);

    const contentRoutes = await routes.collectContentRoutes(docsDir);
    const zhContentRoutes = contentRoutes.filter(route => route.startsWith('/zh/'));
    expect(zhContentRoutes.length, 'zh 侧内容路由为 0 —— 中文站点没有产物').toBeGreaterThan(20);

    // 全量清单（含 `/zh` 静态镜像）必须同时覆盖两种语言。
    const docsRoutes = await routes.collectDocsRoutes(docsDir);
    expect(docsRoutes).toContain('/zh');
    expect(docsRoutes.length).toBeGreaterThan(prerenderRoutes.length);
  });

  it('内容源两侧文件数一致（译文缺失会先被 i18n 门禁拦，但目录整体丢失不会）', () => {
    const enCount = countMarkdown(join(docsDir, 'src/content/en'));
    const zhCount = countMarkdown(join(docsDir, 'src/content/zh'));

    // 与 i18n 门禁的分工：门禁比「逐 slug 是否有译文」，这里比「两侧规模」——
    // 整个 `content/zh` 被搬走时，门禁会因为 en 侧逐条缺失而红，但若两侧同时被搬走
    // （例如 content 目录结构重构），门禁只会看到「en 为空 → 无事可报」。
    expect(enCount).toBeGreaterThan(20);
    expect(zhCount).toBe(enCount);
  });

  it('路由发现对「内容目录为空」是敏感的（探针自证：0 路由会被这条断言抓住）', async () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'ubean-docs-empty-'));
    try {
      // 只有 STATIC_ROUTES，没有任何内容路由 —— 正是事故现场的形状。
      const prerenderRoutes = await routes.collectPrerenderRoutes(emptyRoot);
      expect(prerenderRoutes).toEqual([...routes.STATIC_ROUTES].sort((a, b) => a.localeCompare(b)));
      expect(prerenderRoutes.length).toBeLessThan(30);
      expect(await routes.collectContentRoutes(emptyRoot)).toEqual([]);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it('`index` 类 slug 归一到根路径（内容路由与页面路由必须同一套规则）', () => {
    // `apps/docs/src/pages/[...slug].vue` 用同一函数把 URL 还原成 slug。两边规则不一致时
    // 预渲染会产出 /guide/index 这类 URL，而页面路由只认 /guide。
    expect(routes.resolveContentRoutePath('index')).toBe('/');
    expect(routes.resolveContentRoutePath('guide/index')).toBe('/guide');
    expect(routes.resolveContentRoutePath('guide/getting-started')).toBe('/guide/getting-started');
  });
});

describe('docs 站点的构建链（RM-T02）', () => {
  it('package.json 的 build 三段齐全且顺序正确（api → SSG → seo）', () => {
    const pkg = JSON.parse(readFileSync(join(docsDir, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

    // 顺序有意义：`build:api` 产出 `packages/*/dist/*.d.ts` 派生的 API 文档源，
    // 必须在 SSG 之前；`build:seo`（sitemap/robots）必须在产物之后。
    expect(pkg.scripts['build:api']).toContain('scripts/build-api.ts');
    expect(pkg.scripts['build:seo']).toContain('build/seo.ts');
    expect(pkg.scripts.build).toBe('pnpm build:api && ubean build && pnpm build:seo');
  });

  it('配置把 collectPrerenderRoutes 的产物接进 prerender.include（接线，不是回读布尔值）', () => {
    // 这条不是「回读配置」：断言的是**数据流**——路由发现函数的返回值确实被喂进
    // `prerender.include`。此前站点「能构建但零内容」正是这条接线断掉/为空的形态。
    const config = readFileSync(join(docsDir, 'ubean.config.ts'), 'utf8');
    expect(config).toContain('collectPrerenderRoutes');
    expect(config).toMatch(/prerender:\s*\{[^}]*include:\s*prerenderRoutes/u);
    expect(config).toMatch(/const prerenderRoutes = await collectPrerenderRoutes\(/u);
  });

  it('CI 的 `Build the docs site` 步骤存在且跑的是整站构建', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    const step = workflow.split('\n      - name: ').find(block => block.startsWith('Build the docs site'));

    expect(step, 'CI 里找不到 `Build the docs site` 步骤').toBeDefined();
    // 必须跑**完整**的 SSG 构建：只跑 `build:api` 或 `typecheck` 都发现不了「零路由」。
    expect(step).toContain('pnpm --filter @ubean/docs build');
    expect(step).toContain("runner.os == 'ubuntu-latest'");
  });
});
