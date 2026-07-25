import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadUbeanConfig } from '@ubean/config';
import { resolvePresetByName, registerBuiltinPresets } from '@ubean/preset';
import { findAvailablePort, waitForPort } from '@ubean/utils';
import type { CommandDef } from 'citty';
import { consola } from 'consola';
import { green, cyan, dim, bold } from 'kolorist';
import { resolve, join } from 'pathe';

const logger = consola.withTag('ubean-cli');

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
    logger.start('Starting ubean preview server...');

    registerBuiltinPresets();
    const config = await loadUbeanConfig(cwd);
    const preset = resolvePresetByName(config.build.preset);

    logger.info(`Preset: ${preset.name}`);

    const outputDir = config.build.outputDir || 'dist';

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

    const host = args.host || config.preview.host;
    const strictPort = args.strictPort ?? config.preview.strictPort;
    const requestedPort = Number(args.port) || config.preview.port;

    // Probe for an available port before spawning the server, mirroring the
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

    const { child, exited } = spawnPreviewServer({
      serverPath,
      cwd,
      port: actualPort,
      host,
      strictPort
    });

    const label = (text: string) => dim(text);

    const printBanner = (port: number) => {
      const bannerUrl = `http://${host}:${port}`;
      logger.box(
        `${green(bold('🚀 ubean preview server ready'))}\n\n` +
          `  → ${label('Local:')}      ${cyan(bannerUrl)}\n` +
          `  → ${label('Mode:')}       ${dim('production')}\n` +
          `  → ${label('Preset:')}     ${cyan(preset.name)}\n` +
          `  → ${dim('Press Ctrl+C to stop')}`
      );
    };

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

    printBanner(actualPort);

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
