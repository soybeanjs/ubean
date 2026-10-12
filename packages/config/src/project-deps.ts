/**
 * Project dependency requirements.
 *
 * ubean 的多个能力依赖「用户项目里显式安装的第三方包」，而不是 ubean 自己的依赖：
 * 框架把它们声明为 optional peer，缺失时静默降级或减少功能（`@vean/ui` 缺失 → `S*`
 * 组件无法解析；`satori` 缺失 → OG Image 抛错）。用户看不到「为什么没生效」的线索。
 *
 * 本模块把「什么时候要哪个包」写成一份机器可读清单，供两个入口消费：
 * - `@ubean/cli` 的 `prepare`（每条命令前跑）→ 提示 + TTY 询问后安装
 * - `@ubean/build` 的 `ubeanVite` config 钩子 → 裸 `vite dev` 也覆盖
 *
 * 两类依赖必须区分：
 * - **必需（required）**：能力一旦启用就一定要装（`@vean/ui` / `electron` / `pinia` / `better-auth`）
 * - **可选（optional）**：能力开了也能降级，装了才拿到完整功能（`satori` / `pagefind` / `miniflare`）
 *
 * 单例存储挂在 `globalThis` 上：dev 的 SSR 图会内联 ubean、外部化 `@ubean/*` 子包，
 * 模块级 Map 会导致两侧读到不同的表（见 AGENTS.md 陷阱 #19）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'pathe';
import { BUILTIN_MODULES, extractPackageName } from './modules';

/**
 * 依赖的必需程度。
 * - `required`：能力一旦启用就一定要装，缺失即功能损坏（`@vean/ui` 缺失 → `S*` 组件解析失败）。
 * - `optional`：装了才拿到完整功能，缺失时框架降级（`pagefind` 缺失 → 跳过搜索索引）。
 */
export type ProjectDependencyKind = 'required' | 'optional';

/** 安装位置：`dev` → devDependencies，`prod` → dependencies。 */
export type ProjectDependencyInstallAs = 'dev' | 'prod';

export interface ProjectDependencySpec {
  /** 包名，如 `@vean/ui`。 */
  name: string;
  /** 把包名加进提示时附带的建议版本范围（`pnpm add <name>@<range>`）；缺省不钉版本。 */
  range?: string;
  /** 该包在项目里承担的职责（用一句话解释"为什么需要它"）。 */
  reason: string;
  /** 记录「谁要求的」，用于把同一份清单里的条目归因到模块 / 功能开关。 */
  requiredBy: string;
  /** `required` = 能力启用就必须装；`optional` = 缺少时功能降级。 */
  kind: ProjectDependencyKind /** 安装到 dependencies 还是 devDependencies。 */;
  installAs: ProjectDependencyInstallAs;
  /**
   * `true` 时把版本钉到项目里 `ubean` 的版本（`@ubean/<pkg>@^<ubean 版本>`）——
   * `@ubean/*` 扩展包与主包同版本发布，不钉会出现跨小版本的 API 漂移。
   */
  versionFromUbean?: boolean;
}

/**
 * 一个能力对项目依赖的要求。
 *
 * `selected` 由 `resolveConfigDependencies()` 根据用户配置计算：用户的
 * `modules` / 顶层字段里写了同名模块时，内建模块不加载（`resolveModules` 的去重规则），
 * 但我们仍然要知道这个能力被启用了。
 */
export interface DependencyRequirement {
  /** 能力标识（内建模块 key，或 `markdown-mdx` 这类功能标识）。 */
  id: string;
  /** 已选中为真时该能力需要哪些包。 */
  packages: ProjectDependencySpec[];
}

/* -------------------------------------------------------------------------- */
/* 清单                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 与用户配置**无关**、任何 ubean 项目都必须装的运行期依赖。
 *
 * 这些包在 `ubean` 自己的 `dependencies` 里（运行时 npm 会提升到顶层，Node 解析没问题），
 * 但项目根 `package.json` 里仍然需要显式声明：pnpm 的 isolated node_modules 不会为
 * 未声明的包建立顶层链接，pnpm 生态里 "依赖了没声明" 是漂移与重复安装的来源。
 *
 * **仍然需要显式声明的是模板 / 样式侧**：
 * - `vue-i18n`：客户端 `useI18n` 直源该包（框架不 re-export，见 AGENTS.md 陷阱 #18）；
 *   且 `vue-i18n` 在框架侧是 catalog 依赖，项目不声明会解析到另一份实例。
 * - `vue-router`：客户端 `useRouter` 直源；`@ubean/vue` 的 scanner 也 peer 它。
 */
export const CORE_PROJECT_DEPENDENCIES: ProjectDependencySpec[] = [
  {
    name: 'vue',
    reason: '框架的客户端运行时',
    requiredBy: 'core',
    kind: 'required',
    installAs: 'prod'
  },
  {
    name: 'vue-router',
    reason: '路由（框架不 re-export，客户端 `useRouter` 直源该包）',
    requiredBy: 'core',
    kind: 'required',
    installAs: 'prod'
  },
  {
    name: 'vue-i18n',
    reason: 'i18n（`useI18n` 直源该包；不声明会解析到框架内的另一份实例）',
    requiredBy: 'core',
    kind: 'required',
    installAs: 'prod'
  }
];

/**
 * 内建模块**自身**的包（`ui` → `@ubean/integrations`、`icon` → `@ubean/icon`）。
 *
 * 这些包不在 `ubean` 的 `dependencies` 里（否则每个项目都得拖上 electron / better-auth 这些
 * 重依赖），配置里启用哪个模块就要装哪个包；版本钉到项目的 `ubean` 版本。
 * 从 `BUILTIN_MODULES` 派生，新增内建模块时自动覆盖。
 */
const BUILTIN_MODULE_PACKAGES: Record<string, ProjectDependencySpec> = Object.fromEntries(
  BUILTIN_MODULES.map(builtin => [
    builtin.key,
    {
      name: extractPackageName(builtin.modulePath),
      reason: `\`${builtin.key}\` 内建模块（${builtin.pluginName}）`,
      requiredBy: builtin.key,
      kind: 'required' as const,
      installAs: 'prod' as const,
      versionFromUbean: true
    }
  ])
);

/**
 * 内建模块的必需 peer。**运行期依赖**（如 `@vean/ui`）进 dependencies，
 * **构建期依赖**（`electron` / `@vitejs/plugin-vue`）进 devDependencies。
 *
 * 这些包不在 `ubean` 与模块包的 `dependencies` 里，全部是 optional peer，
 * 缺失时模块加载直接失败或静默降级 —— 用户从 warning 里看不出该装什么。
 */
const BUILTIN_MODULE_PEERS: Record<string, ProjectDependencySpec[]> = {
  ui: [
    {
      name: '@vean/ui',
      range: '>=0.50.0-0',
      reason: '`S*` 组件（自动导入 resolver 与运行时都指向它）',
      requiredBy: 'ui',
      kind: 'required',
      installAs: 'prod'
    }
  ],
  electron: [
    {
      name: 'electron',
      range:
        '^28.0.0 || ^29.0.0 || ^30.0.0 || ^31.0.0 || ^32.0.0 || ^33.0.0 || ^34.0.0 || ^35.0.0 || ^36.0.0 || ^37.0.0',
      reason: 'Electron 桌面外壳（构建期启动 main / preload）',
      requiredBy: 'electron',
      kind: 'required',
      installAs: 'dev'
    }
  ],
  pinia: [
    {
      name: 'pinia',
      reason: 'SSR 状态管理（`createPinia`/`defineStore` 从该包导入）',
      requiredBy: 'pinia',
      kind: 'required',
      installAs: 'prod'
    }
  ],
  auth: [
    {
      name: 'better-auth',
      range: '^1.7.7',
      reason: '认证实现（缺失时 @ubean/auth 只提供最小降级实现）',
      requiredBy: 'auth',
      kind: 'required',
      installAs: 'prod'
    }
  ],
  ai: [
    {
      name: 'ai',
      range: '^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0',
      reason: 'AI SDK 运行时（@ubean/ai 是其薄编排层）',
      requiredBy: 'ai',
      kind: 'required',
      installAs: 'prod'
    },
    {
      name: '@ai-sdk/openai-compatible',
      range: '^1.0.0 || ^2.0.0 || ^3.0.0',
      reason: 'OpenAI 兼容 provider 适配器',
      requiredBy: 'ai',
      kind: 'required',
      installAs: 'prod'
    }
  ]
};

/**
 * 由**功能开关**（而非内建模块加载）触发的依赖。这些能力留在框架包内实现，
 * 但需要项目侧安装可选的第三方包才能拿到完整功能，缺失时降级。
 */
const FEATURE_DEPENDENCIES: Record<string, ProjectDependencySpec[]> = {
  'markdown-mdx': [
    {
      name: '@mdx-js/mdx',
      range: '^3.0.0',
      reason: 'Markdown 的 `mdx: true` 模式（缺失时降级为纯 Markdown）',
      requiredBy: 'markdown.mdx',
      kind: 'optional',
      installAs: 'dev'
    }
  ],
  'og-image': [
    {
      name: 'satori',
      range: '^0.12.0',
      reason: '`ImageResponse` 把 VDOM 渲染成 SVG',
      requiredBy: 'seo.og-image',
      kind: 'optional',
      installAs: 'prod'
    },
    {
      name: '@resvg/resvg-js',
      range: '^2.6.0',
      reason: '把 satori 产出的 SVG 转成 PNG raster',
      requiredBy: 'seo.og-image',
      kind: 'optional',
      installAs: 'prod'
    }
  ],
  'content-search': [
    {
      name: 'pagefind',
      range: '^1.0.0',
      reason: '全文搜索索引（构建后 CLI 生成 `/pagefind/`）',
      requiredBy: 'search',
      kind: 'optional',
      installAs: 'dev'
    }
  ],
  'cloudflare-preview': [
    {
      name: 'miniflare',
      range: '^4.0.0',
      reason: 'Cloudflare 预设的本地 preview（替代 wrangler dev）',
      requiredBy: 'build.preset=cloudflare*',
      kind: 'optional',
      installAs: 'dev'
    }
  ],
  email: [
    {
      name: 'nodemailer',
      reason: '`@ubean/server/email` 的 SMTP 发送',
      requiredBy: 'email',
      kind: 'optional',
      installAs: 'prod'
    }
  ]
};

/* -------------------------------------------------------------------------- */
/* 选择（从配置计算）                                                           */
/* -------------------------------------------------------------------------- */

/**
 * 判定内建模块是否被**选中**。与 `resolveModules` 的去重规则保持一致：
 * 配置值是 `true` / 对象（且未 `disabled: true`）时选中；模块已写进 `modules` 也算选中。
 */
function isBuiltinSelected(config: Record<string, unknown>, key: string): boolean {
  const value = config[key];
  if (value === true) return true;
  if (value && typeof value === 'object') {
    return (value as { disabled?: boolean }).disabled !== true;
  }

  const modules = config.modules;
  if (Array.isArray(modules)) {
    return modules.some(entry => {
      if (typeof entry === 'string') return entry.toLowerCase().includes(key);
      if (Array.isArray(entry)) return typeof entry[0] === 'string' && entry[0].toLowerCase().includes(key);
      if (entry && typeof entry === 'object') {
        const name = (entry as { name?: string }).name ?? '';
        return name.toLowerCase().includes(key);
      }
      return false;
    });
  }
  return false;
}

/**
 * 从已解析配置计算「谁被选中」。返回内建模块 key 与功能标识的集合。
 *
 * `ogImage` 必须由调用方探测（它靠文件约定而不是配置：`src/og-image.ts` /
 * `src/opengraph-image.ts`），缺省不选中 —— 没写 OG 图的项目不该被要求装 satori。
 */
export function resolveSelectedCapabilities(
  config: Record<string, unknown>,
  probes: { ogImage?: boolean } = {}
): Set<string> {
  const selected = new Set<string>();

  for (const key of Object.keys(BUILTIN_MODULE_PACKAGES)) {
    if (isBuiltinSelected(config, key)) selected.add(key);
  }

  const markdown = config.markdown as { enabled?: boolean; mdx?: boolean } | undefined;
  if (markdown && markdown.enabled !== false && markdown.mdx === true) selected.add('markdown-mdx');

  const search = config.search;
  if (
    search === true ||
    (search && typeof search === 'object' && (search as { enabled?: boolean }).enabled !== false)
  ) {
    selected.add('content-search');
  }

  if (probes.ogImage) selected.add('og-image');

  const build = config.build as { preset?: string } | undefined;
  if (typeof build?.preset === 'string' && build.preset.includes('cloudflare')) selected.add('cloudflare-preview');

  return selected;
}

/**
 * OG 图约定的文件探测（与 `registerSeoConventions` 扫的目录一致）。
 *
 * `og-image` 没有配置开关 —— 用户写下这些文件就是「要用 ImageResponse」的信号，
 * 那时才要求 `satori` / `@resvg/resvg-js`。
 */
export function detectOgImageConvention(rootDir: string, srcDir: string): boolean {
  const base = join(rootDir, srcDir);
  return ['og-image.ts', 'og-image.tsx', 'opengraph-image.ts', 'opengraph-image.tsx'].some(file =>
    existsSync(join(base, file))
  );
}

export interface ResolvedProjectDependencies {
  /** 全部需要的依赖（已按包名去重；同一包被多个能力要求时保留 `required` + prod 那条）。 */
  all: ProjectDependencySpec[];
  /** 必需依赖（能力启用就一定要装）。 */
  required: ProjectDependencySpec[];
  /** 可选依赖（缺失时功能降级）。 */
  optional: ProjectDependencySpec[];
}

/**
 * 把配置里的选择展开成依赖清单。
 *
 * `options.core: false` 用于只想检查「扩展依赖」、不检查核心代码的场景（测试 / 库消费方）。
 */
export function resolveConfigDependencies(
  config: Record<string, unknown>,
  options: { core?: boolean; ogImage?: boolean } = {}
): ResolvedProjectDependencies {
  const selected = resolveSelectedCapabilities(config, { ogImage: options.ogImage });
  const specs: ProjectDependencySpec[] = options.core === false ? [] : [...CORE_PROJECT_DEPENDENCIES];

  for (const [id, modulePackage] of Object.entries(BUILTIN_MODULE_PACKAGES)) {
    if (!selected.has(id)) continue;
    specs.push(modulePackage);
    specs.push(...(BUILTIN_MODULE_PEERS[id] ?? []));
  }
  for (const [id, packages] of Object.entries(FEATURE_DEPENDENCIES)) {
    if (selected.has(id)) specs.push(...packages);
  }

  const byName = new Map<string, ProjectDependencySpec>();
  for (const spec of specs) {
    const existing = byName.get(spec.name);
    if (!existing) {
      byName.set(spec.name, spec);
      continue;
    }
    // 同一包被两条要求命中：requirement 优先（任何一方必需则整体必需）
    const kind: ProjectDependencyKind =
      existing.kind === 'required' || spec.kind === 'required' ? 'required' : 'optional';
    const installAs: ProjectDependencyInstallAs =
      existing.installAs === 'prod' || spec.installAs === 'prod' ? 'prod' : 'dev';
    byName.set(spec.name, {
      ...(kind === 'required' ? existing : spec),
      kind,
      installAs,
      versionFromUbean: existing.versionFromUbean || spec.versionFromUbean,
      requiredBy:
        existing.requiredBy === spec.requiredBy ? existing.requiredBy : `${existing.requiredBy}+${spec.requiredBy}`
    });
  }

  const all = [...byName.values()];
  return {
    all,
    required: all.filter(s => s.kind === 'required'),
    optional: all.filter(s => s.kind === 'optional')
  };
}

/* -------------------------------------------------------------------------- */
/* 探测                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 读项目 `package.json` 里 `ubean` 的版本（`dependencies` 优先于 `devDependencies`）。
 *
 * `@ubean/*` 扩展包与主包同版本发布，因此这个版本同时用来钉扩展包与模块包的安装范围；
 * 解析不出具体版本（`workspace:*` / `latest` / 无该依赖 / 文件损坏）时返回 `null`，
 * 调用方退化为不钉版本。
 */
export function resolveProjectUbeanVersion(cwd: string): string | null {
  try {
    const pkgPath = join(cwd, 'package.json');
    if (!existsSync(pkgPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const spec = pkg.dependencies?.ubean ?? pkg.devDependencies?.ubean;
    if (!spec) return null;
    const match = spec.match(/\d+\.\d+\.\d+/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

const DEP_PROBE_KEY = '__ubean_project_dep_probe__';

interface ProbeCache {
  results: Map<string, boolean>;
}

function getProbeCache(): ProbeCache {
  const g = globalThis as typeof globalThis & { [DEP_PROBE_KEY]?: ProbeCache };
  if (!g[DEP_PROBE_KEY]) g[DEP_PROBE_KEY] = { results: new Map() };
  return g[DEP_PROBE_KEY];
}

/** 清空探测缓存（测试用）。 */
export function clearProjectDependencyProbeCache(): void {
  getProbeCache().results.clear();
}

/**
 * 依赖是否在项目里可解析。
 *
 * 用 `createRequire(join(cwd, 'package.json')).resolve(name)`（Node 解析算法 + 从项目根
 * 出发）而不是 `local-pkg`：`local-pkg` 是 CJS 实现，且 `resolveModule` 在 pnpm 的
 * isolated node_modules 下会跨包软链找到**框架自己**的副本 —— 安装提示会因此失效。
 *
 * 对 `@vean/ui` 这类「根入口不导出 / 只在子路径可解析」的包也成立（`resolve` 请求的是
 * 包名本身，走 `exports` 的 `.` 条件）。
 * **`ERR_PACKAGE_PATH_NOT_EXPORTED` 算已安装**：它意味着包就在磁盘上，只是 `exports` 里
 * 没有 `.` 条件（`@ubean/integrations` 就是这种形状 —— 只有 `/pwa` `/ui` 等子路径）。
 * 判据是「项目里有没有这个包」，不是「能否 import 根入口」；否则装了也被判缺失。
 */
export function isProjectDependencyInstalled(name: string, cwd: string): boolean {
  const cache = getProbeCache().results;
  const key = `${cwd}::${name}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let installed = false;
  try {
    const require = createRequire(join(cwd, 'package.json'));
    require.resolve(name);
    installed = true;
  } catch (error) {
    installed = (error as { code?: string }).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED';
  }
  cache.set(key, installed);
  return installed;
}

/** 从清单里筛出缺失项，保持清单顺序（必需在前）。 */
export function findMissingProjectDependencies(
  cwd: string,
  resolved: ResolvedProjectDependencies
): ProjectDependencySpec[] {
  const order = { required: 0, optional: 1 } as const;
  return [...resolved.required, ...resolved.optional]
    .sort((a, b) => order[a.kind] - order[b.kind])
    .filter(spec => !isProjectDependencyInstalled(spec.name, cwd));
}
