export type SelectSsrValue = boolean | 'streaming' | 'data-only';
export type SelectSsrMode = 'ssr' | 'streaming' | 'data-only' | 'csr';

export interface ResolveSelectSsrInput {
  pageSsr?: SelectSsrValue;
  routeRuleSsr?: SelectSsrValue;
  ppr?: boolean;
  excludedByGlob: boolean;
  streaming: boolean;
}

export interface ResolvedSelectSsr {
  mode: SelectSsrMode;
  runLoader: boolean;
  useRenderer: boolean;
}

/**
 * TanStack-style select SSR: page meta wins over routeRules, which win over
 * the global exclude list. Glob exclude stays backward-compatible (CSR shell
 * still runs loader). Explicit `ssr: false` skips the loader.
 */
export function resolveSelectSsr(input: ResolveSelectSsrInput): ResolvedSelectSsr {
  const ssr = input.pageSsr ?? input.routeRuleSsr;

  if (ssr === false) {
    return { mode: 'csr', runLoader: false, useRenderer: false };
  }
  if (ssr === 'data-only') {
    return { mode: 'data-only', runLoader: true, useRenderer: false };
  }
  if (ssr === 'streaming' || input.ppr) {
    return { mode: 'streaming', runLoader: true, useRenderer: true };
  }
  if (ssr === true) {
    return { mode: 'ssr', runLoader: true, useRenderer: true };
  }
  if (input.excludedByGlob) {
    return { mode: 'csr', runLoader: true, useRenderer: false };
  }
  return {
    mode: input.streaming ? 'streaming' : 'ssr',
    runLoader: true,
    useRenderer: true
  };
}

export function ssrModeHeader(mode: SelectSsrMode): string {
  if (mode === 'csr') return 'csr';
  if (mode === 'data-only') return 'data-only';
  if (mode === 'streaming') return 'streaming';
  return 'ssr';
}
