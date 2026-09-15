import type { CapabilityDiagnosisResult } from '@ubean/preset';
import { getLogger } from '@ubean/shared/logger';

const logger = getLogger('dev-server');

export { startDevServer, type DevServer, type DevServerOptions } from './server';

// RM-V14：dev 的 Vite 装配（取代 vite-server.ts + runner.ts）
export { createDevViteServer, type DevViteServer, type DevViteServerOptions } from './dev-vite';

// RM-V03：dev / preview 共用的 Node↔Web 适配（Phase 1 的 dev 路由与 preview 接管都会用到）
export { toWebRequest, sendWebResponse } from '@ubean/build/vite';

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

/**
 * 输出能力诊断结果。
 *
 * `'auto'` 语义(默认):健康时静默 —— "All capability checks passed" 仅在
 * `verbose` 时输出;告警/错误属于 warn/error 级别,始终输出。
 */
export function logDiagnostics(diagnostics: CapabilityDiagnosisResult, options: { verbose?: boolean } = {}): void {
  const { errors, warnings } = formatDiagnostics(diagnostics);

  if (errors.length > 0) {
    logger.error(`Capability errors (${errors.length}):`);
    for (const e of errors) logger.error(e);
  }

  if (warnings.length > 0) {
    logger.warn(`Capability warnings (${warnings.length}):`);
    for (const w of warnings) logger.warn(w);
  }

  if (errors.length === 0 && warnings.length === 0 && options.verbose) {
    logger.info('All capability checks passed');
  }
}
