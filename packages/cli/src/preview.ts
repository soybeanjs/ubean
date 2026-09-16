import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { preview } from 'vite';
import { previewMimeType, resolvePreviewFile, ubeanPreviewPlugin } from '@ubean/build/vite';
import { loadUbeanConfig } from '@ubean/config';
import { registerBuiltinPresets, resolvePresetByName } from '@ubean/preset';
import { getLogger } from '@ubean/shared/logger';
import { findUserViteConfig, findAvailablePort } from '@ubean/shared/node';
import type { CommandDef } from 'citty';
import { bold, cyan, dim, green } from 'kolorist';
import { join, resolve } from 'pathe';

/**
 * 静态文件服务器（spa / ssg 的降级路径）。
 *
 * RM-V25：判定规则不再自己写一份，改用 `@ubean/build/vite` 的 `resolvePreviewFile` —— 插件接管
 * `vite preview` 时用的是同一个函数，两套方言必然分叉（文件名含合法 `...` 的产物曾被
 * `includes('..')` 判成路径穿越）。
 *
 * 主路径已改为 `vite preview` + 插件中间件（RM-V24）；本函数保留给「Vite 预览起不来」的
 * spa / ssg 场景（静态产物不需要服务端能力），以及既有回归测试。
 */
export function startStaticServer(opts: { root: string; port: number; host: string; mode: 'spa' | 'ssg' }): Server {
  const { root, port, host, mode } = opts;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}`);
      const pathname = decodeURIComponent(url.pathname);
      const resolvedFile = resolvePreviewFile(root, pathname, mode);

      if (resolvedFile.kind === 'forbidden') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Bad Request');
        return;
      }
      if (resolvedFile.kind === 'missing') {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Not Found');
        return;
      }

      const body = await readFile(resolvedFile.path);
      res.statusCode = 200;
      res.setHeader('Content-Type', previewMimeType(resolvedFile.path));
      res.setHeader('Content-Length', body.length);
      res.end(body);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(err instanceof Error ? err.message : String(err));
    }
  });

  return server.listen(port, host);
}

const logger = getLogger('cli');

export const previewCommand: CommandDef = {
  meta: {
    name: 'preview',
    description: 'Preview the production build locally'
  },
  args: {
    port: {
      type: 'string',
      description: 'Port to listen on'
    },
    host: {
      type: 'string',
      description: 'Host to listen on'
    },
    strictPort: {
      type: 'boolean',
      description: 'Exit if the port is already in use, instead of auto-incrementing',
      default: false
    },
    cwd: {
      type: 'string',
      description: 'Project root directory',
      default: '.'
    }
  },
  async run({ args }) {
    const cwd = resolve(args.cwd || process.cwd());
    logger.info('Starting ubean preview server...');

    registerBuiltinPresets();
    const config = await loadUbeanConfig(cwd);
    const preset = resolvePresetByName(config.build.preset);

    logger.info(`Preset: ${preset.name}`);

    const outputDir = config.build.outputDir || 'dist';
    const mode = config.mode;

    const host = args.host || config.preview.host;
    const strictPort = args.strictPort ?? config.preview.strictPort;
    const requestedPort = Number(args.port) || config.preview.port;

    // Probe for an available port before starting the server, mirroring the
    // dev server's behaviour: auto-increment when not strict, exit otherwise.
    let actualPort: number;
    try {
      actualPort = await findAvailablePort(requestedPort, { host, strictPort });
    } catch (err: any) {
      if (err?.code === 'EADDRINUSE') {
        logger.error(
          `Port ${requestedPort} is already in use${host ? ` on ${host}` : ''}. ` +
            `Try a different port or remove the --strictPort flag.`
        );
      } else {
        logger.error(`Failed to resolve a port: ${err?.message || String(err)}`);
      }
      process.exit(1);
    }
    if (actualPort !== requestedPort) {
      logger.warn(`Port ${requestedPort} is in use, trying ${actualPort} instead.`);
    }

    const label = (text: string) => dim(text);

    const printBanner = (port: number, modeLabel: string) => {
      const bannerUrl = `http://${host}:${port}`;
      logger.info(
        `${green(bold('🚀 ubean preview server ready'))}\n\n` +
          `  → ${label('Local:')}      ${cyan(bannerUrl)}\n` +
          `  → ${label('Mode:')}       ${dim(modeLabel)}\n` +
          `  → ${label('Preset:')}     ${cyan(preset.name)}\n` +
          `  → ${dim('Press Ctrl+C to stop')}`
      );
    };

    // spa / ssg：`vite preview` + 插件中间件（静态解析规则与内置静态服务器同源）；产物里没有服务端
    // 入口（`hasServer = mode !== 'spa'`，ssg 构建后还会删掉 `dist/server`），故只校验静态目录。
    // fullstack / backend：校验产物里的 `entry.mjs` —— 生产 handler 由插件的预览中间件在进程内
    // 接上（产物内的 `serveStatic` 负责静态与预渲染 HTML）。CLI 不再 spawn `server.mjs`：那是
    // 「预览一个 Node 服务器」，端口探测与子进程编排会掩盖产物本身的问题。cloudflare 产物跑在
    // worker 运行时里，Node 进程内 import 不出来，交由 RM-V26 的 miniflare runner 处理。
    if (preset.name === 'cloudflare') {
      logger.error('Cloudflare preset preview is not supported yet. Use `wrangler dev` instead.');
      process.exit(1);
    }

    const staticRoot = join(cwd, outputDir, 'public');
    const staticMode = mode === 'spa' || mode === 'ssg';
    const requiredArtifact = staticMode ? join(staticRoot, 'index.html') : join(cwd, outputDir, 'server', 'entry.mjs');
    if (!existsSync(requiredArtifact)) {
      logger.error(`Build output not found: ${requiredArtifact}`);
      logger.info('Run `ubean build` first to create a production build.');
      process.exit(1);
    }

    const userViteConfig = findUserViteConfig(cwd);
    let server: Awaited<ReturnType<typeof preview>> | undefined;
    try {
      server = await preview({
        root: cwd,
        configFile: userViteConfig ?? false,
        mode: 'production',
        // 自己的 banner 已经含 Local/Mode/Preset —— 关掉 Vite 的以免重复
        logLevel: 'warn',
        preview: { port: actualPort, host, strictPort },
        // 没有用户 `vite.config` 时核心插件不参与，预览中间件要显式注册（同构建期的做法）
        ...(userViteConfig ? {} : { plugins: [ubeanPreviewPlugin({ config, host })] })
      });
    } catch (err) {
      // spa / ssg 的产物是纯静态文件，不依赖服务端能力 —— Vite 预览起不来时用内置静态服务器兜底
      // （这也是 `startStaticServer` 保留至今的原因）。fullstack / backend 没有等价兜底：它们的
      // 预览必须经过生产 handler，降级成静态服务会给出「看着能开、实际没渲染」的假象。
      if (!staticMode) {
        logger.error(`Failed to start the preview server: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      logger.warn(
        `Vite preview unavailable (${err instanceof Error ? err.message : String(err)}); falling back to the built-in static server.`
      );
      const fallback = startStaticServer({ root: staticRoot, port: actualPort, host, mode });
      printBanner(actualPort, `static (${mode})`);
      const cleanupFallback = () => {
        fallback.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 1000).unref();
      };
      process.on('SIGINT', cleanupFallback);
      process.on('SIGTERM', cleanupFallback);
      return;
    }

    printBanner(actualPort, staticMode ? `static (${mode})` : 'production');

    const cleanup = () => {
      void server
        ?.close()
        .catch(() => undefined)
        .finally(() => process.exit(0));
      // close 卡住时兜底退出
      setTimeout(() => process.exit(0), 1000).unref();
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
};
