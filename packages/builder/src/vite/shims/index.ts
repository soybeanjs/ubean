/**
 * worker 目标下的 Node 内建桩（构建期重写为**虚拟模块**）。
 *
 * **为什么必须是构建期重写**：worker 运行时（Cloudflare 等）没有文件系统，而打包器会把静态
 * import 的 node 内建**留在产物里** —— workerd 在**模块实例化**阶段就失败
 * （`No such module "node:fs/promises"`），运行时的条件分支和动态 `import()` 都救不了
 * （后者会被 rolldown 内联，连同目标模块顶部的 node:fs）。
 *
 * **为什么用虚拟模块而不是指向一个 `.ts` 文件**：构建产物里 `import.meta.url` 指向 `dist/`，
 * 而源文件不在那里（实测报 `Could not load ../../packages/builder/dist/node-fs.ts`）。虚拟模块
 * 把桩源码内联，与包布局无关。也**不能用 `resolve.alias`**：Vite 解析器对 `node:` 前缀会短路，
 * alias 命不中（实测配了 alias 产物里照样有 `node:fs`）。
 *
 * 覆盖三类：
 * - `node:fs` / `node:fs/promises`：运行时不支持，且实测会出现在服务端图里；
 * - `nodemailer`：**可选依赖**，`@ubean/server` 的 SMTP provider 用变量化 specifier 延迟加载，
 *   但 worker 目标全量内联（`noExternal: [/./]` + `codeSplitting: false`）会把动态 import 一起
 *   打包。10.x 起 nodemailer 是 ESM，入口图顶层静态 `import 'node:http'` → workerd 实例化即失败。
 *
 * `node:crypto` / `node:async_hooks` / `node:path` 由 `nodejs_compat` 兼容标志支持，保持原样。
 *
 * 桩**抛错而不是静默返回空值**：静默降级会把「静态资源没被服务」「缓存没落盘」变成谜题。
 */

import * as nodeFs from 'node:fs';
import * as nodeFsPromises from 'node:fs/promises';

/**
 * 生成一个桩模块的源码：把 Node 真实模块里的**每个函数导出**都声明一遍（各自抛错）。
 *
 * 为什么要生成而不是手写：worker 构建会把依赖全部打包（`noExternal: true`），于是第三方
 * 依赖也会 `import { readdir, realpathSync, stat } from 'fs'` —— 手写清单必然漏名，而漏名的
 * 表现是**构建期 `MISSING_EXPORT` 失败**（比运行时谜团好，但仍然是无谓的中断）。从真实的
 * `node:fs` 导出面生成，既覆盖完整又跟得上 Node 版本。
 *
 * 非函数导出（`fs.constants` / `fs.promises`）不进桩：它们不是调用点，真被使用时会由打包器
 * 报缺名 —— 那种情况更适合在构建期看见。
 */
const RESERVED = new Set(['default', 'class', 'function', 'var', 'let', 'const', 'new', 'delete', 'in', 'of']);

/** 只接受合法且非保留字的标识符（CJS 互操作会给命名空间塞一个 `default`）。 */
function isDeclarable(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !RESERVED.has(name);
}

function buildStubSource(moduleNamespace: Record<string, unknown>, runtime: string, apiPrefix: string): string {
  const names = Object.keys(moduleNamespace).filter(
    name => isDeclarable(name) && typeof moduleNamespace[name] === 'function'
  );
  const declarations = names.map(name => `export function ${name}() { return unsupported('${name}'); }`).join('\n');
  // 非函数导出（`fs.promises` / `fs.constants`）也要声明：依赖会 `import { promises } from 'node:fs'`，
  // 缺名会让**构建期**报 `MISSING_EXPORT`（实测：完整示例里 unplugin-auto-import 的构建期代码被
  // 打包进 worker 图时就撞到这一条）。声明成「访问即抛错」的代理，语义与函数桩一致。
  const nonFunctions = Object.keys(moduleNamespace).filter(
    name => isDeclarable(name) && typeof moduleNamespace[name] !== 'function'
  );
  const objectDeclarations = nonFunctions
    .map(
      name =>
        `export const ${name} = new Proxy({}, { get: (_t, prop) => unsupported('${apiPrefix}.${name}.' + String(prop)) });`
    )
    .join('\n');

  return `const MESSAGE = (api) =>
  api + ' 需要 Node 系运行时（${runtime}）。当前运行时（Cloudflare Workers 等）没有文件系统：' +
  '静态资源请交给平台层（wrangler.toml 的 assets.directory），缓存请用 store: "memory" 或 KV/对象存储驱动。';
function unsupported(api) {
  throw new Error(MESSAGE(api));
}
${declarations}
${objectDeclarations}
export default new Proxy({}, { get: (_t, prop) => () => unsupported('${apiPrefix}.' + String(prop)) });
`;
}

const STUB_PREFIX = '\0ubean-node-stub:';

/** 规格名 → 桩源码（`node:` 前缀与裸包名都收，两者都会被 import）。 */
const FS_STUB_SOURCE = buildStubSource(nodeFs as unknown as Record<string, unknown>, 'node:fs', 'fs');
const FS_PROMISES_STUB_SOURCE = buildStubSource(
  nodeFsPromises as unknown as Record<string, unknown>,
  'node:fs/promises',
  'fs/promises'
);

/* -------------------------------------------------------------------------- */
/* worker 目标下的 nodemailer 桩（可选依赖，Node-only）                          */
/* -------------------------------------------------------------------------- */

/**
 * `nodemailer` 的桩：worker 目标下把它换成「调用即抛错」的模块。
 *
 * 为什么需要：worker 目标 `noExternal: [/./]` + `codeSplitting: false`，**任何**动态 import
 * 都会被内联。`@ubean/server/src/email.ts` 用变量化 specifier 延迟加载 nodemailer（SMTP
 * provider 用），内联后 nodemailer 的完整图进入产物。10.x 起它是 ESM 包，入口图里
 * `dist/esm/fetch/index.js` **顶层静态** `import 'node:http'` —— workerd 在模块实例化阶段
 * 直接失败 `No such module "node:http"`（`nodejs_compat` 不覆盖 http/net/tls，只有 fs 系列
 * 有桩）。9.x 是 CJS 单包，恰好没有这类静态导入，所以问题只在 10.x 暴露。
 *
 * 语义正确：worker 里本来也发不了 SMTP（没有 net/tls），桩把「运行时谜团」变成「明确的
 * 平台约束错误」，与 fs 桩同一策略。
 */
const NODEMAILER_STUB_SOURCE = `const MESSAGE = (api) =>
  api + ' 需要 Node 系运行时（SMTP 依赖 net/tls）。当前运行时（Cloudflare Workers 等）不支持：' +
  '请在 Node 系平台上发送邮件，或改用提供 HTTP API 的邮件服务商。';
function unsupported(api) {
  throw new Error(MESSAGE(api));
}
export function createTransport() { return unsupported('nodemailer.createTransport'); }
export function createTestAccount() { return unsupported('nodemailer.createTestAccount'); }
export default new Proxy({}, { get: (_t, prop) => () => unsupported('nodemailer.' + String(prop)) });
`;

const STUB_SOURCES: Record<string, string> = {
  'node:fs': FS_STUB_SOURCE,
  fs: FS_STUB_SOURCE,
  'node:fs/promises': FS_PROMISES_STUB_SOURCE,
  'fs/promises': FS_PROMISES_STUB_SOURCE,
  nodemailer: NODEMAILER_STUB_SOURCE
};

/** 该 id 在 worker 目标下是否要换成桩；命中时返回虚拟模块 id。 */
export function resolveWorkerNodeStub(id: string): string | undefined {
  return id in STUB_SOURCES ? `${STUB_PREFIX}${id}` : undefined;
}

/** 虚拟模块 id → 源码（`load` 用）；非桩 id 返回 `undefined`。 */
export function loadWorkerNodeStub(id: string): string | undefined {
  if (!id.startsWith(STUB_PREFIX)) return undefined;
  return STUB_SOURCES[id.slice(STUB_PREFIX.length)];
}

/**
 * 供构建期审计与测试使用的清单。
 *
 * @internal — 唯一消费者是 `test/worker-target.test.ts`；构建链路只用
 * `resolveWorkerNodeStub` / `loadWorkerNodeStub`。
 */
export const WORKER_NODE_STUB_IDS = Object.freeze(Object.keys(STUB_SOURCES));
