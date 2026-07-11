import type { UbeanApp } from '../../runtime/app';
import type { Preset } from '../preset/_utils/preset';
import type { CapabilitySet, CapabilityDiagnosisResult } from '../preset/capabilities';

export interface DevRunnerOptions {
  cwd: string;
  srcDir: string;
  port: number;
  host: string;
  preset: Preset;
  app: UbeanApp;
  capabilities: CapabilitySet;
  onListen?: (info: { port: number; host: string; url: string }) => void;
  onBeforeReload?: () => void | Promise<void>;
  onAfterReload?: () => void | Promise<void>;
  onDiagnostics?: (diagnostics: CapabilityDiagnosisResult) => void;
}

export interface DevRunner {
  readonly port: number;
  readonly host: string;
  readonly url: string;
  readonly preset: Preset;
  start(): Promise<void>;
  stop(): Promise<void>;
  reload(): Promise<void>;
  updateApp(app: UbeanApp): void;
}

export interface EnvRunner {
  name: string;
  isAvailable(): boolean | Promise<boolean>;
  createRunner(options: DevRunnerOptions): Promise<DevRunner>;
}

class NodeDevRunner implements DevRunner {
  private server: import('node:http').Server | null = null;
  private currentApp: UbeanApp;
  private readonly options: DevRunnerOptions;
  private _port: number;

  constructor(options: DevRunnerOptions) {
    this.options = options;
    this.currentApp = options.app;
    this._port = options.port;
  }

  get port() {
    return this._port;
  }

  get host() {
    return this.options.host;
  }

  get url() {
    return `http://${this.options.host}:${this._port}`;
  }

  get preset() {
    return this.options.preset;
  }

  async start(): Promise<void> {
    const { createServer } = await import('node:http');

    this.server = createServer(async (req, res) => {
      try {
        await this.currentApp.init();
        const protocol = (req.socket as any)?.encrypted ? 'https' : 'http';
        const webReq = await toWebRequest(req, this.options.host, protocol);
        const webRes = await this.currentApp.fetch(webReq);
        await sendWebResponse(res, webRes);
      } catch (err) {
        res.statusCode = 500;
        res.end(err instanceof Error ? err.message : 'Internal Server Error');
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.on('error', reject);
      this.server!.listen(this._port, this.options.host, () => {
        const addr = this.server!.address();
        this._port = typeof addr === 'object' && addr ? addr.port : this._port;
        resolve();
      });
    });

    this.options.onListen?.({
      port: this._port,
      host: this.options.host,
      url: this.url
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((res, rej) => {
        this.server!.close(err => (err ? rej(err) : res()));
      });
      this.server = null;
    }
  }

  async reload(): Promise<void> {
    await this.options.onBeforeReload?.();
    await this.options.onAfterReload?.();
  }

  updateApp(app: UbeanApp): void {
    this.currentApp = app;
  }
}

async function toWebRequest(req: import('node:http').IncomingMessage, host: string, protocol: string): Promise<Request> {
  const url = `${protocol}://${req.headers.host || host}${req.url || '/'}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else {
        headers.set(key, value);
      }
    }
  }

  const method = req.method || 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : (req as unknown as any);

  return new Request(url, {
    method,
    headers,
    body,
    duplex: 'half'
  } as RequestInit);
}

async function sendWebResponse(res: import('node:http').ServerResponse, webRes: Response): Promise<void> {
  res.statusCode = webRes.status;
  res.statusMessage = webRes.statusText;
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (webRes.body) {
    const reader = webRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();
}

export const nodeRunner: EnvRunner = {
  name: 'node',
  isAvailable() {
    return typeof process !== 'undefined' && !!process.versions?.node;
  },
  async createRunner(options) {
    return new NodeDevRunner(options);
  }
};

const runners: EnvRunner[] = [nodeRunner];

export function registerRunner(runner: EnvRunner): void {
  runners.unshift(runner);
}

export function getRegisteredRunners(): EnvRunner[] {
  return [...runners];
}

export async function selectRunner(_preset: Preset): Promise<EnvRunner | null> {
  for (const runner of runners) {
    if (await runner.isAvailable()) {
      return runner;
    }
  }
  return null;
}

export async function createDevRunner(options: DevRunnerOptions): Promise<DevRunner> {
  const runner = await selectRunner(options.preset);
  if (!runner) {
    throw new Error(
      `No compatible dev runner found for preset "${options.preset.name}". ` +
        'Ensure you are running in a supported environment (Node.js).'
    );
  }
  return runner.createRunner(options);
}
