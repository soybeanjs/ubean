import { getLogger } from '@ubean/logger';
import type { CapabilityDiagnosisResult } from '@ubean/preset';

const logger = getLogger('dev-server');

export {
  createDevRunner,
  selectRunner,
  registerRunner,
  getRegisteredRunners,
  viteNodeRunner,
  type DevRunner,
  type DevRunnerOptions,
  type EnvRunner,
  type DevRunnerDevtoolsOptions
} from './runner';

export { createDevWatcher, type DevWatcher, type DevWatcherOptions, type WatchEvent } from './watcher';

export { startDevServer, type DevServer, type DevServerOptions } from './server';

export { createViteDevServer, type ViteDevServerInstance, type ViteDevServerOptions } from './vite-server';

export function formatDiagnostics(diagnostics: CapabilityDiagnosisResult): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const err of diagnostics.diagnostics.filter(d => !d.supported && d.required)) {
    errors.push(`  ✗ ${err.capability}: ${err.message}`);
  }

  for (const warn of diagnostics.diagnostics.filter(d => !d.supported && !d.required)) {
    warnings.push(`  ! ${warn.capability}: ${warn.message}`);
  }

  return { errors, warnings };
}

export function logDiagnostics(diagnostics: CapabilityDiagnosisResult): void {
  const { errors, warnings } = formatDiagnostics(diagnostics);

  if (errors.length > 0) {
    logger.error(`Capability errors (${errors.length}):`);
    for (const e of errors) logger.error(e);
  }

  if (warnings.length > 0) {
    logger.warn(`Capability warnings (${warnings.length}):`);
    for (const w of warnings) logger.warn(w);
  }

  if (errors.length === 0 && warnings.length === 0) {
    logger.info('All capability checks passed');
  }
}
