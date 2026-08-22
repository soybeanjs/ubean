import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { extname, normalize } from 'node:path';
import { loadUbeanConfig } from '@ubean/config';
import { resolvePresetByName, registerBuiltinPresets } from '@ubean/preset';
import { getLogger } from '@ubean/shared/logger';
import { findAvailablePort, waitForPort } from '@ubean/shared/node';
import type { CommandDef } from 'citty';
import { green, cyan, dim, bold } from 'kolorist';
import { resolve, join } from 'pathe';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

/**
 * 启动静态文件服务器,用于 spa / ssg 模式预览。
 *
 * - ssg 模式:优先查找 `<path>/index.html` 或 `<path>.html`,找不到时返回 404
 * - spa 模式:所有非文件路由回退到 `index.html`(客户端路由接管)
 *
 * 使用 Node 内置 `http` + `fs`,避免引入 `sirv` 等依赖。
 */
function startStaticServer(opts: { root: string; port: number; host: string; mode: 'spa' | 'ssg' }): Server {
  const { root, port, host, mode } = opts;
  const spaFallback = mode === 'spa';

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}`);
      let pathname = normalize(decodeURIComponent(url.pathname));
      // 防止路径穿越
      if (pathname.includes('..')) {
        res.statusCode = 400;
        res.end('Bad Request');
        return;
      }

      let filePath = join(root, pathname);
      let fileExists = existsSync(filePath) && (await stat(filePath)).isFile();

      // 1. 若是目录,尝试 index.html
      if (!fileExists && existsSync(filePath) && (await stat(filePath)).isDirectory()) {
        const indexPath = join(filePath, 'index.html');
        if (existsSync(indexPath)) {
          filePath = indexPath;
          fileExists = true;
        }
      }

      // 2. ssg 模式:尝试 <path>/index.html
      if (!fileExists && mode === 'ssg') {
        const indexPath = join(filePath, 'index.html');
        if (existsSync(indexPath) && (await stat(indexPath)).isFile()) {
          filePath = indexPath;
          fileExists = true;
        }
      }

      // 3. ssg 模式:尝试 <path>.html
      if (!fileExists && mode === 'ssg') {
        const htmlPath = `${filePath}.html`;
        if (existsSync(htmlPath) && (await stat(htmlPath)).isFile()) {
          filePath = htmlPath;
          fileExists = true;
        }
      }

      // 4. spa 模式:回退到 index.html
      if (!fileExists && spaFallback) {
        const fallbackPath = join(root, 'index.html');
        if (existsSync(fallbackPath)) {
          filePath = fallbackPath;
          fileExists = true;
        }
      }

      if (!fileExists) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Not Found');
        return;
      }

      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const body = await readFile(filePath);
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
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

    // spa / ssg 模式:启动静态文件服务器,预览 dist/public/
    if (mode === 'spa' || mode === 'ssg') {
      const staticRoot = join(cwd, outputDir, 'public');
      if (!existsSync(staticRoot)) {
        logger.error(`Build output not found: ${staticRoot}`);
        logger.info('Run `ubean build` first to create a production build.');
        process.exit(1);
      }

      const server = startStaticServer({
        root: staticRoot,
        port: actualPort,
        host,
        mode
      });

      printBanner(actualPort, `static (${mode})`);

      const cleanup = () => {
        server.close(() => process.exit(0));
        // Force-exit if close stalls
        setTimeout(() => process.exit(0), 1000).unref();
      };
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      server.on('error', err => {
        logger.error(`Preview server error: ${err.message || err}`);
        process.exit(1);
      });
      return;
    }

    // fullstack / backend 模式:启动 Node 服务器(现有行为)
    // Determine the server entry file based on the preset's entry type
    const presetName = preset.name;
    let serverFile: string;
    if (presetName === 'node' || presetName === 'bun' || presetName === 'deno') {
      serverFile = 'server.mjs';
    } else if (presetName === 'cloudflare') {
      logger.error('Cloudflare preset preview is not supported yet. Use `wrangler dev` instead.');
      process.exit(1);
    } else {
      serverFile = 'handler.mjs';
      logger.warn(`Preset "${presetName}" uses a fetch handler entry. Preview may not work as a standalone server.`);
    }

    const serverPath = join(cwd, outputDir, 'server', serverFile);

    if (!existsSync(serverPath)) {
      logger.error(`Build output not found: ${serverPath}`);
      logger.info('Run `ubean build` first to create a production build.');
      process.exit(1);
    }

    const { child, exited } = spawnPreviewServer({
      serverPath,
      cwd,
      port: actualPort,
      host,
      strictPort
    });

    // Wait until the spawned server is actually accepting connections before
    // announcing readiness. This replaces the previous fixed `setTimeout`.
    try {
      await waitForPort(actualPort, { host, retries: 40, delay: 250 });
    } catch {
      // The port may not be ready yet — check whether the child has already
      // exited (e.g. EADDRINUSE) and surface a friendly message instead.
      if (exited.value) {
        logger.error(`Preview server exited before becoming ready on port ${actualPort}.`);
      } else {
        logger.warn(`Preview server on port ${actualPort} is not responding yet, the banner may be premature.`);
      }
    }

    printBanner(actualPort, 'production');

    const cleanup = () => {
      child.kill('SIGTERM');
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    child.on('exit', code => {
      if (code !== 0 && code !== null) {
        logger.error(`Preview server exited with code ${code}`);
      }
      process.exit(code ?? 0);
    });
  }
};

interface SpawnResult {
  child: ChildProcess;
  exited: { value: boolean };
}

function spawnPreviewServer(opts: {
  serverPath: string;
  cwd: string;
  port: number;
  host: string;
  strictPort: boolean;
}): SpawnResult {
  const exited = { value: false };

  const child = spawn('node', [opts.serverPath], {
    cwd: opts.cwd,
    env: {
      ...process.env,
      PORT: String(opts.port),
      HOST: opts.host
    },
    // Pipe stderr so we can detect EADDRINUSE while still forwarding output.
    stdio: ['inherit', 'inherit', 'pipe']
  });

  let addrInUseReported = false;

  child.stderr?.on('data', chunk => {
    const text = chunk.toString();
    process.stderr.write(text);

    // Surface a friendly message if the child itself hits EADDRINUSE (rare
    // TOCTOU between the pre-spawn probe and the actual listen call).
    if (!addrInUseReported && /EADDRINUSE/.test(text)) {
      addrInUseReported = true;
      logger.error(
        `Port ${opts.port} is already in use${opts.host ? ` on ${opts.host}` : ''}. ` +
          `Try a different port${opts.strictPort ? ' or remove the --strictPort flag' : ''}.`
      );
    }
  });

  child.on('exit', () => {
    exited.value = true;
  });

  return { child, exited };
}
