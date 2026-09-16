import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { generateTypes } from '@ubean/build/codegen';
import { buildProduction, buildWithEnvironments } from '@ubean/build/production';
import { loadUbeanConfig, resolvePrerenderConfig, resolveSsrConfig } from '@ubean/config';
import type { AppMode } from '@ubean/config';
import { resolvePresetByName, registerBuiltinPresets } from '@ubean/preset';
import { scanProject } from '@ubean/scan';
import { getLogger } from '@ubean/shared/logger';
import type { CommandDef } from 'citty';
import { resolve, join } from 'pathe';

const logger = getLogger('cli');

type ContentBuildOptions = {
  sources?: Record<string, { dir: string; prefix?: string; type?: string }>;
  defaultDir?: string;
};

async function loadContentForBuild(
  cwd: string,
  content: boolean | ContentBuildOptions | undefined
): Promise<{ snapshot: Record<string, unknown[]> | undefined; routes: string[] }> {
  if (!content) return { snapshot: undefined, routes: [] };
  try {
    const mod = await import('@ubean/content');
    const options: ContentBuildOptions = content === true ? {} : content;
    const snapshot = mod.scanContentSources(cwd, options);
    const routes = mod.extractContentPageRoutes(Object.values(snapshot).flat());
    return { snapshot, routes };
  } catch {
    return { snapshot: undefined, routes: [] };
  }
}

/**
 * Creates a fetcher that invokes the built SSR entry to render real HTML.
 * Inspired by void's Node prerender runner: import the built `entry.mjs`,
 * call its `createFetchHandler()` to obtain a `fetch(req)` function, then
 * drive it with synthetic `http://localhost<path>` requests.
 *
 * If the SSR entry cannot be loaded (e.g. missing dependencies), returns
 * `undefined` so the caller falls back to the existing placeholder behavior.
 */
/**
 * RM-V21：`createSsrFetcher` 已随预渲染逻辑下沉到 `@ubean/build` 的 `prerender-step.ts`。
 */

export const buildCommand: CommandDef = {
  meta: {
    name: 'build',
    description: 'Build the ubean application for production'
  },
  args: {
    preset: {
      type: 'string',
      description: 'Deployment preset (node, bun, deno, cloudflare, vercel, netlify, standard)'
    },
    mode: {
      type: 'string',
      description: 'App mode (fullstack, spa, ssg, backend). Overrides ubean.config.ts mode'
    },
    ssr: {
      type: 'boolean',
      description: 'Enable SSR in fullstack mode (only effective with --mode fullstack). Use --no-ssr to disable'
    },
    ssg: {
      type: 'boolean',
      description: 'Shortcut for --mode ssg',
      default: false
    },
    outDir: {
      type: 'string',
      description: 'Output directory (overrides ubean.config.ts build.outputDir)'
    },
    minify: {
      type: 'boolean',
      description: 'Minify output',
      default: true
    },
    sourcemap: {
      type: 'boolean',
      description: 'Generate sourcemaps',
      default: false
    },
    prerender: {
      type: 'boolean',
      description: 'Pre-render static pages (SSG)'
    },
    cwd: {
      type: 'string',
      description: 'Project root directory',
      default: '.'
    }
  },
  async run({ args }) {
    const cwd = resolve(args.cwd || process.cwd());
    logger.info('Building ubean application...');

    try {
      registerBuiltinPresets();
      const config = await loadUbeanConfig(cwd);

      // CLI --mode / --ssg 覆盖配置文件中的 mode
      if (args.ssg) {
        config.mode = 'ssg';
      } else if (args.mode) {
        config.mode = args.mode as AppMode;
      }

      // CLI --ssr / --no-ssr 覆盖配置(仅在 fullstack 模式下生效)
      if (config.mode === 'fullstack' && args.ssr !== undefined) {
        config.ssr = resolveSsrConfig(args.ssr as boolean);
      }

      // 根据 mode 调整 prerender 行为
      if (config.mode === 'ssg') {
        // SSG 模式默认开启全部预渲染(若用户未显式配置 all/include)
        if (!config.prerender.all && config.prerender.include.length === 0) {
          config.prerender = resolvePrerenderConfig({ all: true });
        }
      } else if (config.mode === 'spa' || config.mode === 'backend') {
        config.prerender = resolvePrerenderConfig(); // 关闭
      } else if (config.mode === 'fullstack' && !config.ssr.enabled) {
        // fullstack + ssr:false 无法 prerender(无 SSR bundle)
        config.prerender = resolvePrerenderConfig(); // 关闭
      }

      // CLI --prerender / --no-prerender 覆盖
      if (args.prerender === true) {
        if (!config.prerender.enabled) {
          config.prerender = resolvePrerenderConfig({ all: true });
        }
      } else if (args.prerender === false) {
        config.prerender = resolvePrerenderConfig(); // 关闭
      }

      const presetName = args.preset || config.build.preset;

      const preset = resolvePresetByName(presetName);
      logger.info(`Using preset: ${preset.name}`);
      logger.info(`App mode: ${config.mode}${config.mode === 'fullstack' ? ` (ssr=${config.ssr.enabled})` : ''}`);

      logger.info('Scanning project...');
      const result = await scanProject({
        cwd,
        srcDir: config.srcDir,
        dirs: config.dir,
        ignore: config.scanOptions?.ignore
      });

      logger.info(
        `Found ${result.apiRoutes.length} API routes, ${result.pages.length} pages, ${result.layouts.length} layouts`
      );

      logger.info('Generating types...');
      await generateTypes(result, {
        cwd,
        srcDir: config.srcDir,
        buildDir: '.ubean',
        dirs: config.dir,
        autoImports: config.autoImports,
        components: config.components
      });

      const resolvedPreset = preset as { name: string; hooks?: Record<string, (ctx: any) => void | Promise<void>> };

      if (resolvedPreset.hooks?.['build:before']) {
        await resolvedPreset.hooks['build:before']({
          cwd,
          outputDir: config.build.outputDir,
          preset: resolvedPreset,
          config: config as unknown as Record<string, unknown>
        });
      }

      logger.info('Building with Vite...');
      // `NODE_ENV` 守卫：Vite 尊重显式设置的 `NODE_ENV`，因此 `NODE_ENV=test pnpm build`（CI 里很常见）
      // 会把**开发态代码**打进客户端产物 —— 实测同一个示例项目 entry gzip 从 45.2 kB 涨到 75.9 kB
      // （Vue dev runtime + 开发警告），而 `--minify` 默认开着也拦不住它（不是压缩问题，是打的代码不同）。
      // 不强行覆盖用户的显式设置（那会偏离 Vite 语义），只提示到能被看见。
      const nodeEnv = process.env.NODE_ENV;
      if (nodeEnv && nodeEnv !== 'production') {
        logger.warn(
          `NODE_ENV=${nodeEnv}：客户端产物会包含开发态代码（如 Vue dev runtime 与开发警告）。` +
            '生产构建请设置 NODE_ENV=production，或不要设置该变量。'
        );
      }
      // `--outDir` 覆盖产物目录：CI/矩阵测试需要把不同路径的产物写到不同目录做对照，
      // 而不是互相覆盖（RM-V23 的「两条路径产物一致」断言即依赖此参数）。
      if (args.outDir) {
        (config.build as { outputDir: string }).outputDir = String(args.outDir);
      }

      const { snapshot: contentSnapshot } = await loadContentForBuild(cwd, config.content);
      // RM-V21：开关打开时 `ubean build` 与 `vite build` 走同一条 builder 路径（两次独立
      // `viteBuild` 的旧编排退居开关之后）。先用环境变量声明「构建已由 CLI 驱动」，插件侧的
      // `config` 钩子据此不再注册自己的 `builder.buildApp`/`environments` —— 否则同一份构建
      // 会被两个 buildApp 编排（`__ubean_build__` 的用途）。
      const viteBuilder = config.experimental?.viteBuilder === true;
      if (viteBuilder) process.env.UBEAN_BUILD_DRIVEN_BY_CLI = '1';
      const manifest = viteBuilder
        ? await buildWithEnvironments({
            cwd,
            config,
            preset: resolvedPreset,
            scanResult: result,
            minify: args.minify as boolean,
            sourcemap: args.sourcemap as boolean,
            contentSnapshot
          })
        : await buildProduction({
            cwd,
            config,
            preset: resolvedPreset,
            scanResult: result,
            minify: args.minify as boolean,
            sourcemap: args.sourcemap as boolean,
            contentSnapshot
          });

      // 预渲染与内容搜索索引已下沉到 `@ubean/build` 的 `runPrerenderStep()`（RM-V21）：
      // 它由两条路径共用的 `runEnvBuilds()` 调用，`vite build` 因此也能产出静态 HTML。

      // SSG 模式:清理临时 server bundle(prerender 已加载到内存,删除文件不影响静态 HTML)
      if (config.mode === 'ssg' && !process.env.UBEAN_KEEP_SSR) {
        const serverDir = join(cwd, config.build.outputDir, 'server');
        if (existsSync(serverDir)) {
          logger.info('Cleaning temporary SSR bundle (SSG mode)...');
          await rm(serverDir, { recursive: true, force: true });
        }
      }

      if (resolvedPreset.hooks?.['build:after']) {
        await resolvedPreset.hooks['build:after']({
          cwd,
          outputDir: config.build.outputDir,
          preset: resolvedPreset,
          config: config as unknown as Record<string, unknown>,
          manifest
        });
      }

      logger.info(`Build complete for preset "${resolvedPreset.name}"!`);
      logger.info(`  Output directory: ${resolve(cwd, config.build.outputDir)}`);
      if (manifest.entry) {
        logger.info(`  Server entry: ${manifest.entry}`);
      }
      logger.info(`  Client assets: ${manifest.assets.length} files`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    // 显式退出:Vite/unplugin 的 worker pool (tinypool) 以及 prerender
    // 动态导入的 SSR entry 可能保留事件循环引用,导致进程无法自然退出。
    process.exit(0);
  }
};
