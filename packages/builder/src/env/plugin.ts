/**
 * `ubean:env/*` 虚拟模块插件（Astro `astro:env` 的 Vite 版）。
 *
 * 提供两个模块：
 * - `ubean:env/client` — 客户端可见字段，构建期内联成字面量。任何环境都能 import。
 * - `ubean:env/server` — 服务端字段，运行期读 `process.env`。**在客户端环境 import 直接让构建失败**
 *   （这是抄 SvelteKit `$env/static/private` 的护栏；比 Astro 的「类型上没有」更强一层）。
 *
 * 与 `ubean:core` 的关系：本插件**不**进 `VIRTUAL_MODULES` 数组（那是 core 的私有清单），
 * 自己处理 `resolveId`/`load`。好处是两条路径（CLI 自建 builder / 裸 `vite build`）都只需
 * 在 `ubeanPlugin()` 里加一行，core 的 resolveId 顺序不受影响 —— 只要本插件排在 core **之后**
 * 即可（core 只会拦它自己那份清单，不会碰 `ubean:env/*`）。
 */

import { loadEnv } from 'vite';
import type { Plugin } from 'vite';
import type { ResolvedConfig } from '@ubean/config';
import { renderEnvClientModule, renderEnvServerModule, resolveEnvModules } from './types';
import type { EnvModules } from './types';

export const ENV_CLIENT_ID = 'ubean:env/client';
export const ENV_SERVER_ID = 'ubean:env/server';

const RESOLVED_CLIENT = '\0ubean:env/client';
const RESOLVED_SERVER = '\0ubean:env/server';

/** 客户端环境名（`createBuildEnvironments()` 里注册的那个）。 */
const CLIENT_ENVIRONMENT = 'client';

export interface UbeanEnvPluginOptions {
  /** 已解析配置（`ensureUbeanConfig()` 的产物）。 */
  config: ResolvedConfig;
}

/**
 * 生成模块所需的信息在 `configResolved` 才能全部拿到：
 * - `config.env`（Vite 解析后的 `import.meta.env` 快照）由 Vite 在钩子入参里给
 * - 同一个钩子还会给出 `mode`，用于判定生产/开发（决定 warn 的措辞）
 */
export function ubeanEnvPlugin(options: UbeanEnvPluginOptions): Plugin {
  const { config } = options;

  let importMetaEnv: Record<string, unknown> = {};
  /**
   * `.env` 文件的原始内容（`loadEnv(mode, envDir, '')`，**不过 prefix 过滤**）。
   *
   * 服务端字段的解析来源：`configResolved` 里把它合进 `process.env`，生成的
   * `ubean:env/server` 模块才能读到 `.env`。不合并的话，`process.env` 里只有真实导出的
   * 环境变量，`.env` 里写的 `SERVER_PORT` / `JWT_SECRET` 全是 undefined。
   */
  let fileEnv: Record<string, string> = {};
  let modules: EnvModules | null = null;

  /**
   * 幂等构建（dev 下 client / ubean 两个环境各跑一次钩子，但结果一致 —— 缓存即可）。
   *
   * **不缓存**会被服务端环境污染：`resolveEnvModules()` 的 server 分支会读 `process.env`
   * 来决定 optional，而两次调用之间 `.env` 不会变，所以缓存是安全的。
   */
  function ensureModules(): EnvModules {
    if (modules) return modules;
    modules = resolveEnvModules({
      schema: (config.env?.schema ?? {}) as Record<string, unknown>,
      // 两份来源都给：`importMetaEnv` 里有 Vite 的 `MODE` / `DEV` / `PROD` / `BASE_URL`，
      // `.env` 文件里有全量 key（包含没写 `VITE_` 前缀的 client 字段 —— 那些 Vite 不会
      // 注入 `import.meta.env`）。后给的不会被前两者覆盖，所以 `importMetaEnv` 优先。
      dotEnv: fileEnv,
      importMetaEnv
    });
    return modules;
  }

  return {
    name: 'ubean:env',
    // 必须在 core 之后：core 的 resolveId 只认自己的 VIRTUAL_MODULES，不会碰 env；
    // 但 load 顺序上让 core 先跑可以保证它自己的虚拟模块走原路径。
    enforce: 'post',

    configResolved(resolved) {
      importMetaEnv = resolved.env as unknown as Record<string, unknown>;

      // ── `.env` → `process.env` ──────────────────────────────────────────
      //
      // 实测：`vite dev` **不会**把 `.env` 写进 `process.env`（Vite 只把它注入
      // `import.meta.env`，而且仅限 prefix 命中的 key）。而 `ubean:env/server` 的取值面
      // 就是 `process.env`（它是 static 语义，模块求值时读一次）—— 不做这一步，`.env` 里
      // 的 `SERVER_PORT` / `JWT_SECRET` / `DATABASE_URL` 在运行期全是 undefined，只在真
      // 实导出的环境变量下才能工作。
      //
      // 只填空缺（`process.env` 优先）：与 Vite 自己的规则一致 —— 真实环境变量压过 `.env` 文件，
      // 否则 CI 里显式 `JWT_SECRET=... pnpm dev` 会被仓库里的 `.env` 默默盖掉。
      //
      // 只在这一层做、不在生成的模块里做：生成代码跑在浏览器/服务端两侧，文件 IO 给不进去；
      // 而且 dev 下服务端运行时就跑在同一个进程里，这里填的 `process.env` 它直接看得到。
      fileEnv = loadEnv(resolved.mode, resolved.envDir ?? resolved.root, '');
      for (const [key, value] of Object.entries(fileEnv)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }

      modules = null;
    },

    resolveId(id) {
      if (id === ENV_CLIENT_ID) return RESOLVED_CLIENT;
      if (id === ENV_SERVER_ID) return RESOLVED_SERVER;
      return undefined;
    },

    load(id) {
      if (id === RESOLVED_CLIENT) {
        return renderEnvClientModule(ensureModules().client);
      }

      if (id === RESOLVED_SERVER) {
        // ── 护栏 ────────────────────────────────────────────────────────────────
        // 客户端环境 import 服务端 env → 构建直接失败。
        //
        // 为什么用抛错而不是「替换成空对象」：静默降级会让 `JWT_SECRET` 在浏览器里变成
        // `undefined`，随后变成一条运行期报错，根因（哪个文件 import 错了）已经丢了。
        // 抛错的栈里带着 importer，一次构建就能定位。
        //
        // 判据用 environment 名而非 `this.environment.config.consumer`：前者是本仓库
        // 自己注册的名字（`createBuildEnvironments()`），后者会随 Vite 版本漂移。
        if (this.environment?.name === CLIENT_ENVIRONMENT) {
          throw new Error(
            `[ubean:env] \`${ENV_SERVER_ID}\` cannot be imported from client code.\n` +
              'Server env (including `access: \'secret\'` fields) is never sent to the browser.\n' +
              "Move the read into server-only code (`src/routes/**`, `src/services/**`, `src/db/**`),\n" +
              'or declare the field with `context: \'client\', access: \'public\'` if it is safe to inline.'
          );
        }

        return renderEnvServerModule(ensureModules().server, config.env?.mode ?? 'warn');
      }

      return undefined;
    }
  };
}

export { resolveEnvModules, renderEnvClientModule, renderEnvServerModule };
export type { EnvModules, EnvFieldSpec, ResolveEnvModulesInput } from './types';
