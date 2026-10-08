/**
 * preset 入口模板的字符串门禁（ADR-0002 Decision 1 的「快照单测」那一半）。
 *
 * ADR-0002 Decision 1 点名两个模块：`production.ts` 与 `virtual-modules.ts`，要求「对生成的
 * 字符串做 snapshot/断言，作为快速单元门禁」。实测这份边界**只落地了一半**：
 *
 * | 模块 | 语句覆盖 | 现状 |
 * | ---- | -------- | ---- |
 * | `virtual-modules.ts` | 97.7% | 有 `virtual-modules.test.ts`（关键片段断言） |
 * | `production.ts` | **6.2%** | 只有 `serializePagesForEntry` / `getPresetBuildConfig` 被间接覆盖 |
 *
 * 本文件补上 `production.ts` 里**纯字符串生成器**那一半：三份 preset 入口模板 + islands SSR
 * 空壳插件。它们零依赖、零 IO、毫秒级 —— 正是 Decision 1 说的「快速单元门禁」形态。
 *
 * **为什么不是 `toMatchSnapshot()`**（与 `virtual-modules.test.ts` 同一立场，见其文件头）：
 * 整串快照会在改一行注释时变红 —— 那是噪音不是信号。这里锁的是**契约**：模板必须 import 哪个
 * 文件名、必须传哪个参数、必须保留哪个逃生口。`packages/ubean/test/exports.test.ts` 的
 * `EXPECTED_EXPORTS` 显式表也是这个形态，那里同样自称「快照」而非 `toMatchSnapshot`。
 *
 * **一处跨模块契约**（事故类缺陷的典型形态：两边各自改、都不报错）：模板 import 的是
 * `./entry.mjs`，而那个文件名由 `serverOutputNames()` 的 `entryFileNames` 决定。两处任一改动
 * 而另一处没跟上，产物在运行时才报 `No such module` —— 所以这里把两者钉在一起。
 */
import { describe, expect, it } from 'vitest';
import { registerBuiltinPresets, resolvePresetByName } from '@ubean/preset';
import {
  createIslandsSsrStubPlugin,
  generateCloudflareWorkerEntry,
  generateNodeServerEntry,
  generateStandardHandlerEntry,
  getPresetBuildConfig
} from '../src/production';
import { serverOutputNames } from '../src/vite/build-configs';

registerBuiltinPresets();

/** 三份入口模板都从这里 import 服务端 bundle —— 名字必须与 `serverOutputNames()` 一致。 */
const SERVER_BUNDLE_IMPORT = "from './entry.mjs'";

const entries = {
  node: generateNodeServerEntry(),
  worker: generateCloudflareWorkerEntry(),
  standard: generateStandardHandlerEntry()
} as const;

describe('preset 入口模板（ADR-0002 Decision 1）', () => {
  it('三份模板都 import 产物里真实存在的服务端 bundle 名', () => {
    // 跨模块契约：模板写死 `./entry.mjs`，实际文件名由 `entryFileNames` 决定。
    expect(serverOutputNames(getPresetBuildConfig(resolvePresetByName('node'))).entryFileNames).toBe('entry.mjs');

    for (const [name, source] of Object.entries(entries)) {
      expect(source, `${name} 模板应 import ${SERVER_BUNDLE_IMPORT}`).toContain(SERVER_BUNDLE_IMPORT);
      // 不能 import `./server.mjs`：那是**包装文件自己**的名字（node 目标下由 `writePresetWrapper`
      // 写成 `dist/server/server.mjs`），自引用会变成循环。
      expect(source).not.toContain("from './server.mjs'");
      expect(source).not.toContain("from './handler.mjs'");
      expect(source).not.toContain("from './worker.mjs'");
    }
  });

  it('node 模板保留端口/主机的环境变量逃生口与优雅关闭', () => {
    const source = entries.node;

    expect(source).toContain("import { createServer } from 'node:http'");
    expect(source).toContain('process.env.PORT || 9527');
    expect(source).toContain("process.env.HOST || '0.0.0.0'");
    // 部署平台会覆盖这两个；写死则所有平台都只能跑 9527。
    expect(source).toContain("process.on('SIGINT', shutdown)");
    expect(source).toContain("process.on('SIGTERM', shutdown)");
  });

  it('node 模板的请求转换保留了三个必需细节（缺一个就静默坏掉）', () => {
    const source = entries.node;

    // 1. `duplex: 'half'` —— Node 的 fetch 接受流式 body 时**必需**，否则抛
    //    `RequestInit: duplex option is required when sending a body`。
    expect(source).toContain("duplex: 'half'");
    // 2. GET / HEAD 不能带 body —— 带了会让 Request 构造抛错。
    expect(source).toContain("method === 'GET' || method === 'HEAD' ? undefined : req");
    // 3. 错误路径必须先判断 headersSent，否则在已流式输出的响应上 setHeader 会抛
    //    `ERR_HTTP_HEADERS_SENT`，把原始错误吞成二次异常。
    expect(source).toContain('if (!res.headersSent)');
    expect(source).toContain('res.statusCode = 500');
  });

  it('标准 fetch 与 worker 模板都在模块顶层记忆化 handler（不是每请求重建 app）', () => {
    for (const [name, source] of [
      ['standard', entries.standard],
      ['worker', entries.worker]
    ] as const) {
      // `createFetchHandler()` 建的是整个 Hono app；放进请求处理函数里会让每个请求重建一次，
      // 症状是「功能正常但内存与延迟持续增长」，本地小流量测不出来。
      expect(source, `${name} 模板应在模块顶层调用一次`).toContain('const handlerPromise = createFetchHandler();');
      const calls = source.match(/createFetchHandler\(\)/gu) ?? [];
      expect(calls, `${name} 模板只能调用一次 createFetchHandler`).toHaveLength(1);
      // 每次请求 await 的是那个 promise，而不是重新调用。
      expect(source).toContain('const handler = await handlerPromise;');
    }

    expect(entries.standard).toContain('export default async function fetch(req, ctx)');
    expect(entries.worker).toContain('export default {');
    expect(entries.worker).toContain('async fetch(req, env, ctx)');
    // worker 的 `env` 必须并进 ctx：KV / D1 / secrets 都从 `env` 取，丢了就等于没有绑定。
    expect(entries.worker).toContain('return handler(req, { ...ctx, env });');
    expect(entries.standard).toContain('return handler(req, ctx);');
  });
});

describe('islands SSR 空壳插件（ADR-0002 Decision 1）', () => {
  const plugin = createIslandsSsrStubPlugin();

  it('以 pre 阶段拦下裸 specifier，换成 NUL 前缀的虚拟 id', () => {
    expect(plugin.name).toBe('ubean:islands-ssr-stub');
    // enforce: 'pre' 必需 —— 晚了会被其它插件的解析抢先，裸 specifier 就泄漏给 Node 了。
    expect(plugin.enforce).toBe('pre');
    // NUL 前缀是 Vite 虚拟模块约定：告诉打包器「这不是文件，别去磁盘找」。
    expect(plugin.resolveId?.('virtual:ubean-islands-registry', undefined, {} as never)).toBe(
      '\0virtual:ubean-islands-registry'
    );
    expect(plugin.resolveId?.('some-other-id', undefined, {} as never)).toBeUndefined();
  });

  it('空壳内容只导出空注册表，且只对虚拟 id 生效', () => {
    expect(plugin.load?.('\0virtual:ubean-islands-registry', undefined)).toBe('export const islands = {};');
    expect(plugin.load?.('some-other-id', undefined)).toBeUndefined();
    // 空壳**不能**有任何副作用（如 import 客户端运行时）—— SSR 期 islands 由服务端渲染，
    // 带上客户端依赖会让服务端图多出一份浏览器代码。
    expect(plugin.load?.('\0virtual:ubean-islands-registry', undefined)).not.toContain('import ');
  });
});
