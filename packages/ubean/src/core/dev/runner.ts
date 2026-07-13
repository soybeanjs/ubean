import type { ResolvedConfig } from '../config/types';
import type { UbeanApp } from '../../runtime/app';
import type { Preset } from '../preset/_utils/preset';
import type { CapabilitySet, CapabilityDiagnosisResult } from '../preset/capabilities';
import type { ScannedLayout } from '../routing/types';

export interface DevRunnerOptions {
  cwd: string;
  srcDir: string;
  port: number;
  host: string;
  preset: Preset;
  app: UbeanApp;
  layouts?: ScannedLayout[];
  config: ResolvedConfig;
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
  updateApp(app: UbeanApp, layouts?: ScannedLayout[]): void;
}

export interface EnvRunner {
  name: string;
  isAvailable(): boolean | Promise<boolean>;
  createRunner(options: DevRunnerOptions): Promise<DevRunner>;
}

class ViteNodeDevRunner implements DevRunner {
  private viteDevServer: import('./vite-server').ViteDevServerInstance | null = null;
  private currentApp: UbeanApp;
  private currentLayouts: ScannedLayout[];
  private readonly options: DevRunnerOptions;
  private _port: number;

  constructor(options: DevRunnerOptions) {
    this.options = options;
    this.currentApp = options.app;
    this.currentLayouts = options.layouts || [];
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
    const { createViteDevServer } = await import('./vite-server');

    this.viteDevServer = await createViteDevServer({
      cwd: this.options.cwd,
      port: this._port,
      host: this.options.host,
      config: this.options.config,
      app: this.currentApp,
      layouts: this.currentLayouts,
      onListen: ({ port, host, url }) => {
        this._port = port;
        this.options.onListen?.({ port, host, url });
      }
    });

    await this.viteDevServer.start();
  }

  async stop(): Promise<void> {
    if (this.viteDevServer) {
      await this.viteDevServer.stop();
      this.viteDevServer = null;
    }
  }

  async reload(): Promise<void> {
    await this.options.onBeforeReload?.();
    if (this.viteDevServer) {
      this.viteDevServer.updateApp(this.currentApp, this.currentLayouts);
    }
    await this.options.onAfterReload?.();
  }

  updateApp(app: UbeanApp, layouts?: ScannedLayout[]): void {
    this.currentApp = app;
    if (layouts) this.currentLayouts = layouts;
    if (this.viteDevServer) {
      this.viteDevServer.updateApp(app, this.currentLayouts);
    }
  }
}

export const viteNodeRunner: EnvRunner = {
  name: 'vite-node',
  isAvailable() {
    return typeof process !== 'undefined' && !!process.versions?.node;
  },
  async createRunner(options) {
    return new ViteNodeDevRunner(options);
  }
};

const runners: EnvRunner[] = [viteNodeRunner];

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
