import type { ScaffoldType } from './page';

export const SCAFFOLD_CONTRACT_VERSION = 1 as const;

export interface ScaffoldArgManifest {
  name: string;
  required: boolean;
  description: string;
  default?: string;
}

export interface ScaffoldTypeManifest {
  type: ScaffoldType;
  /** Dedicated CLI command (`ubean api add`, …) or `ubean page add --type`. */
  cli: boolean;
  /** Directory relative to `src/`. */
  baseDir: string;
  extensions: string[];
  args: ScaffoldArgManifest[];
}

export interface ScaffoldManifest {
  contractVersion: typeof SCAFFOLD_CONTRACT_VERSION;
  types: ScaffoldTypeManifest[];
}

const TYPES: ScaffoldTypeManifest[] = [
  {
    type: 'page',
    cli: true,
    baseDir: 'pages',
    extensions: ['.vue'],
    args: [{ name: 'path', required: true, description: 'Route path (e.g. users/[id])' }]
  },
  {
    type: 'api',
    cli: true,
    baseDir: 'routes',
    extensions: ['.ts'],
    args: [
      { name: 'path', required: true, description: 'API route path (e.g. users/[id])' },
      { name: 'method', required: false, description: 'HTTP method', default: 'GET' }
    ]
  },
  {
    type: 'layout',
    cli: true,
    baseDir: 'layouts',
    extensions: ['.vue'],
    args: [{ name: 'path', required: true, description: 'Layout name (e.g. admin)' }]
  },
  {
    type: 'middleware',
    cli: true,
    baseDir: 'middleware',
    extensions: ['.ts'],
    args: [{ name: 'path', required: true, description: 'Middleware path (e.g. auth)' }]
  },
  {
    type: 'cron',
    cli: true,
    baseDir: 'server/crons',
    extensions: ['.ts'],
    args: [
      { name: 'path', required: true, description: 'Cron task path (e.g. daily-cleanup)' },
      { name: 'schedule', required: false, description: 'Cron expression', default: '* * * * *' }
    ]
  },
  {
    type: 'plugin',
    cli: true,
    baseDir: 'plugins',
    extensions: ['.ts'],
    args: [{ name: 'path', required: true, description: 'Plugin path (e.g. analytics)' }]
  },
  {
    type: 'reuse',
    cli: false,
    baseDir: 'pages',
    extensions: ['.reuse.ts', '.reuse.vue'],
    args: [
      {
        name: 'path',
        required: true,
        description: 'Reuse route path; library API only (`scaffold({ type: "reuse" })`)'
      }
    ]
  }
];

/** Machine-readable scaffold catalog for studio / IDE plugins (RM-S01). */
export function getScaffoldManifest(): ScaffoldManifest {
  return {
    contractVersion: SCAFFOLD_CONTRACT_VERSION,
    types: TYPES
  };
}
