#!/usr/bin/env node
/**
 * 生成「中型站」基准 fixture（docs/perf-regression-net.md 的整站口径补充）。
 *
 * 背景：`examples/ubean-test` 是极小示例项目（~30 个页面，含大量非常规路由），
 * 直接拿它的构建时间与竞品「整站构建」公开数据同列会被口径差异淹没。本生成器
 * 产出一个**页数可控、结构均质**的内容站 fixture，用于：
 * - `scripts/benchmark-ssg.mjs` 的 SSG vs Fullstack prerender 对比（整站规模）
 * - 与 Astro/Nuxt/Next 的「中型内容站构建时间」公开数据做量级对照
 *
 * fixture 落在仓库内的临时目录（默认 `.tmp-bench-medium`，已被 .gitignore 忽略），
 * 依赖通过 Node/Vite 的向上查找复用仓库根 node_modules，**不需要 pnpm install**。
 *
 * 用法：
 *   node scripts/bench-medium-fixture.mjs                      # 默认 80 页 → .tmp-bench-medium
 *   node scripts/bench-medium-fixture.mjs --pages 100          # 100 页
 *   node scripts/bench-medium-fixture.mjs --dir .tmp-bench-x   # 指定目录
 *   node scripts/bench-medium-fixture.mjs --force              # 覆盖已有目录
 *
 * 产物结构（每页结构均质，便于跨框架对照）：
 *   src/pages/index.vue          首页，链接到全部内容页
 *   src/pages/404.vue            预设 404
 *   src/pages/doc/page-N.vue     内容页 × pages
 *   src/layouts/default.vue      默认布局
 *   ubean.config.ts              显式 prerender.include = 全部页面（ssg/fullstack 同集合）
 */
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

/** 每个内容页渲染的条目数（控制单页 SSR 工作量）。 */
const ITEMS_PER_PAGE = 40;

/** 内容页路径（不含首页与 404）。 */
function contentPaths(pages) {
  return Array.from({ length: pages }, (_, i) => `/doc/page-${i + 1}`);
}

function contentPageSource(index) {
  return `<script setup lang="ts">
const title = 'Benchmark doc page ${index}';
const items = Array.from({ length: ${ITEMS_PER_PAGE} }, (_, i) => ({
  id: i,
  label: \`Section \${i + 1}\`,
  body: 'The quick brown fox jumps over the lazy dog. '.repeat(3).trim()
}));
</script>

<template>
  <article class="doc-page">
    <h1>{{ title }}</h1>
    <p>Generated fixture page ${index} of the medium-site benchmark.</p>
    <ul>
      <li v-for="item in items" :key="item.id">
        <strong>{{ item.label }}</strong>
        <p>{{ item.body }}</p>
      </li>
    </ul>
  </article>
</template>
`;
}

function indexPageSource(pages) {
  const links = Array.from(
    { length: pages },
    (_, i) => `      <li><a :href="\`/doc/page-${i + 1}\`">Doc page ${i + 1}</a></li>`
  ).join('\n');
  return `<script setup lang="ts">
const pages = ${pages};
</script>

<template>
  <main class="home">
    <h1>Medium-site benchmark fixture</h1>
    <p>{{ pages }} generated content pages.</p>
    <ul>
${links}
    </ul>
  </main>
</template>
`;
}

const NOT_FOUND_SOURCE = `<template>
  <main class="not-found">
    <h1>404</h1>
    <p>Page not found.</p>
  </main>
</template>
`;

const LAYOUT_SOURCE = `<script setup lang="ts"></script>

<template>
  <div class="site">
    <header class="site-header"><strong>Bench fixture</strong></header>
    <main class="site-main"><PageView /></main>
    <footer class="site-footer">generated for scripts/benchmark-ssg.mjs</footer>
  </div>
</template>
`;

function configSource(pages) {
  // 不含 '/404'：404.vue 是预设特殊页，框架自动产出 404.html，显式列入会以 404 状态
  // 计入 prerender 错误数（见 ssg-catchall 的同类配置）。
  const include = ['/', ...contentPaths(pages)];
  return `import { defineConfig } from 'ubean';

// 由 scripts/bench-medium-fixture.mjs 生成 —— 不要手工编辑。
// 显式列出 include：ssg 与 fullstack 两个模式预渲染**同一组**路由，
// 使 scripts/benchmark-ssg.mjs 的对比是同口径的（否则 ssg 会 all:true 展开全集）。
export default defineConfig({
  srcDir: 'src',
  prerender: {
    all: false,
    include: [
${include.map(path => `      '${path}'`).join(',\n')}
    ]
  }
});
`;
}

const VITE_CONFIG_SOURCE = `import { defineConfig } from 'vite-plus';
import { ubeanPlugin } from 'ubean/vite';

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  plugins: [ubeanPlugin()]
});
`;

/**
 * 在 `dir` 生成 N 页的中型站 fixture。
 * @param {{ dir?: string, pages?: number, force?: boolean }} [options]
 * @returns {Promise<{ dir: string, pages: number, routes: string[] }>}
 */
export async function ensureMediumFixture(options = {}) {
  const dir = resolve(repoRoot, options.dir ?? '.tmp-bench-medium');
  const pages = Math.max(1, options.pages ?? 80);
  const force = options.force ?? false;

  if (existsSync(dir) && !force) {
    // 已存在且页数一致时直接复用，避免每次基准都重新生成（生成本身是确定性的）。
    const existing = join(dir, 'ubean.config.ts');
    if (existsSync(existing)) return { dir, pages, routes: ['/', ...contentPaths(pages)] };
  }
  if (force) await rm(dir, { recursive: true, force: true });

  const write = async (relPath, content) => {
    const target = join(dir, relPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  };

  await write(
    'package.json',
    `${JSON.stringify({ name: 'bench-medium-fixture', private: true, type: 'module' }, null, 2)}\n`
  );
  await write('vite.config.ts', VITE_CONFIG_SOURCE);
  await write('ubean.config.ts', configSource(pages));
  await write(
    'tsconfig.json',
    `${JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', strict: true, jsx: 'preserve', skipLibCheck: true } }, null, 2)}\n`
  );
  await write('src/layouts/default.vue', LAYOUT_SOURCE);
  await write('src/pages/index.vue', indexPageSource(pages));
  await write('src/pages/404.vue', NOT_FOUND_SOURCE);
  for (let i = 1; i <= pages; i += 1) {
    await write(`src/pages/doc/page-${i}.vue`, contentPageSource(i));
  }

  return { dir, pages, routes: ['/', ...contentPaths(pages)] };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                          */
/* -------------------------------------------------------------------------- */

function argValue(name, fallback) {
  const args = process.argv.slice(2);
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (invokedDirectly) {
  const result = await ensureMediumFixture({
    dir: argValue('--dir', '.tmp-bench-medium'),
    pages: parseInt(argValue('--pages', '80'), 10) || 80,
    force: process.argv.includes('--force')
  });
  console.log(
    `[bench-fixture] ${relative(repoRoot, result.dir)} · ${result.pages} content pages · ${result.routes.length} routes`
  );
}
