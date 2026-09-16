/**
 * 生产构建的端到端守卫（Phase 2 前置）。
 *
 * 这组断言存在的原因是**一次真实漏检**：RM-V14 让 `ubeanVite` 接管 `@vitejs/plugin-vue`
 * 的注册后，dev 路径同步去掉了重复注册，build 路径漏改 —— 于是 `.vue` 被编译两次，第二个
 * 实例拿到已编译成 JS 的代码，`ubean build` 直接失败（“At least one <template> or <script>
 * is required”）。当时**没有任何测试跑生产构建**：dev 侧有 500+ 断言，example 的 783 条
 * 测的是运行时 API，`prerender` 测试直接调 `prerender()` 而不是完整构建；只有 `analyze:check`
 * 会跑 `ubean build`，而它不在本轮的验证清单里。
 *
 * 因此这里从**公共入口**跑一次完整构建（`buildWithEnvironments` —— RM-V36 收敛后唯一的编排），
 * 断言产物契约：
 * `.vue` 能被编译（这条就能拦住重复注册）、`dist/public`/`dist/server` 布局、preset 包装、
 * `dist/manifest.json` 内容。
 *
 * fixture 放在 `packages/builder/test/fixtures/build-project/`（仓库内）而不是 tmpdir：
 * tmpdir 在工作区外时 Vite 的依赖解析会失败（RM-V14 的 fixture 陷阱）。builder 的 tsconfig
 * 已 exclude `test`，因此 fixture 的 `src/**` 不参与 typecheck。
 */
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// 编排函数走 `/production` 子路径（主入口只导出构建期工具链）
import { buildWithEnvironments } from '@ubean/build/production';
import { loadUbeanConfig } from '@ubean/config';
import { resolvePresetByName, registerBuiltinPresets } from '@ubean/preset';
import { scanProject } from '@ubean/scan';

const FIXTURE = resolve(import.meta.dirname, 'fixtures/build-project');
/** 产物写到 fixture 内的临时目录，避免污染仓库（跑完删除）。 */
const OUT_DIR = '.temp-build';

afterEach(() => {
  rmSync(join(FIXTURE, OUT_DIR), { recursive: true, force: true });
  rmSync(join(FIXTURE, '.ubean'), { recursive: true, force: true });
});

describe('生产构建（buildWithEnvironments）', () => {
  it('完整构建：编译 .vue、产出 dist 布局、preset 包装与 manifest', async () => {
    registerBuiltinPresets();
    const config = await loadUbeanConfig(FIXTURE);
    const scanResult = await scanProject({ cwd: FIXTURE, srcDir: config.srcDir, dirs: config.dir });
    const preset = resolvePresetByName(config.build.preset);

    const manifest = await buildWithEnvironments({
      cwd: FIXTURE,
      // 输出目录走临时目录；其余配置保持真实解析结果
      config: { ...config, build: { ...config.build, outputDir: OUT_DIR } },
      preset,
      scanResult
    });

    const distRoot = join(FIXTURE, OUT_DIR);
    const publicDir = join(distRoot, 'public');
    const serverDir = join(distRoot, 'server');

    // 客户端产物：入口 chunk 与 Vite manifest（.vue 能编译到这里即说明没有重复注册 vue 插件）。
    // 注意 `index.html` 由 **prerender** 产出（按路由写 HTML），不是客户端构建的输入 ——
    // 客户端入口是虚拟模块 `client-entry.mjs`，HTML 模板只落在 `.ubean/virtual/index.html`。
    expect(existsSync(join(publicDir, 'assets'))).toBe(true);
    expect(existsSync(join(publicDir, '.vite', 'manifest.json'))).toBe(true);
    const assetFiles = readdirSync(join(publicDir, 'assets'));
    expect(assetFiles.some(file => file.endsWith('.js'))).toBe(true);
    expect(existsSync(join(FIXTURE, '.ubean', 'virtual', 'index.html'))).toBe(true);

    // 服务端产物 + node preset 包装
    expect(existsSync(join(serverDir, 'entry.mjs'))).toBe(true);
    expect(existsSync(join(serverDir, 'server.mjs'))).toBe(true);
    expect(existsSync(join(serverDir, 'package.json'))).toBe(true);

    // manifest 契约
    expect(manifest.entry).toBe('server.mjs');
    expect(manifest.clientDir).toBe(join(OUT_DIR, 'public'));
    expect(manifest.serverDir).toBe(join(OUT_DIR, 'server'));
    expect(manifest.preset).toBe(preset.name);
    expect(manifest.assets.some(asset => asset.isEntry)).toBe(true);

    const written = JSON.parse(readFileSync(join(distRoot, 'manifest.json'), 'utf-8'));
    expect(written).toMatchObject({ entry: 'server.mjs', preset: preset.name });

    // RM-V18：服务端产物**自包含** —— 资产标签在构建期注入，运行时不再读 client 的磁盘清单。
    // 这条断言是那次整改的判据：它曾经在 bundle 里读 `../public/.vite/manifest.json`。
    const serverBundle = readFileSync(join(serverDir, 'entry.mjs'), 'utf-8');
    expect(serverBundle).not.toContain('.vite/manifest.json');
    expect(serverBundle).toContain('assets/app-');
    // 注入的 asset tag（bundle 里是 JSON 字符串字面量，引号被转义，因此断言到 src 为止）
    expect(serverBundle).toContain('"body": "<script type=\\"module\\" src=\\"/assets/app-');
  }, 180_000);
});
