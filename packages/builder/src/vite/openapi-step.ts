/**
 * 构建期生成 `.ubean/openapi.d.ts`（OpenAPI → TypeScript 类型）。
 *
 * **为什么需要这一步**：`/_openapi.json` 是 `generateSpecs(app, …)`（hono-openapi）从 Hono app
 * 现算的，需要 routes 已经注册并加载完毕。`ubean dev` 靠「起 server 再 HTTP 拉一次」拿到它，
 * 于是类型声明**只在跑过一次 dev 之后才存在** —— 干净检出下 `pnpm type-check` 会报一片
 * `Cannot find module '../../.ubean/openapi'` 以及连带的 `pathParams`/`query` 类型不匹配
 * （实测：示例项目因此在 CI 里根本没法把 type-check 变成门禁）。
 *
 * 构建产物里的 `entry.mjs` 恰好就是那份 app，所以这里发一个**进程内请求**取 schema：不发网络、
 * 不依赖 dev server，与 `createSsrFetcher` 同源（同一条「import entry → createFetchHandler →
 * 合成 `http://localhost<path>` 请求」的路子）。
 *
 * 放在 `runEnvBuilds` 里而不是 CLI：`ubean build` 与 `vite build` 两条路径都要产出它
 * （ADR-0012 的产物一致性）。
 */
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getLogger } from '@ubean/shared/logger';
import { join, resolve } from 'pathe';
import { generateOpenApiTypes } from '../codegen/openapi-types';
import type { BuildManifest } from '../production';

const logger = getLogger('build');

export interface OpenApiTypesStepOptions {
  cwd: string;
  manifest: BuildManifest;
  /** 输出目录（相对 cwd），即 `.ubean`。 */
  buildDir: string;
}

export interface OpenApiTypesStepResult {
  /** 生成的声明文件路径；未生成时为 `undefined`。 */
  filePath?: string;
  /** 跳过原因（无服务端产物 / 无 JSON 响应 / entry 不可用），用于日志与测试断言。 */
  skipped?: string;
}

/**
 * 从构建好的 SSR entry 取 `/_openapi.json` 并生成类型声明。
 *
 * 任何一步不成立都**不抛错**：类型声明是 DX 产物，不该让构建失败（与预渲染的容错策略一致）。
 * 无后端模式（ssg / spa）本就没有服务端产物或该路由返回 HTML，直接跳过。
 */
export async function runOpenApiTypesStep(options: OpenApiTypesStepOptions): Promise<OpenApiTypesStepResult> {
  const { cwd, manifest, buildDir } = options;

  const entryPath = resolve(cwd, manifest.serverDir, 'entry.mjs');
  if (!existsSync(entryPath)) return { skipped: 'no server entry' };

  let mod: Record<string, unknown>;
  try {
    mod = await import(/* @vite-ignore */ pathToFileURL(entryPath).href);
  } catch (err) {
    logger.warn(`Failed to load SSR entry for OpenAPI types: ${err instanceof Error ? err.message : String(err)}`);
    return { skipped: 'entry import failed' };
  }

  try {
    // 用 `createApp({ openAPI })` 建一个**只用于取 spec 的临时 app 实例**：生产产物本身刻意不注册
    // 文档路由（`openAPI` 只在 dev 传），所以直接请求 `/_openapi.json` 会 404。这里在实例化时单独
    // 打开它，生产路径的 `createFetchHandler()` 不受影响 —— 产出的应用面没有变化。
    const createApp = mod.createApp as
      | ((options?: Record<string, unknown>) => Promise<{ fetch: (request: Request) => Promise<Response> }>)
      | undefined;
    if (typeof createApp !== 'function') return { skipped: 'no createApp export' };

    const app = await createApp({
      openAPI: { scalarPath: '/_scalar', openAPIPath: '/_openapi.json' }
    });
    if (typeof app?.fetch !== 'function') return { skipped: 'app.fetch not available' };

    const response = await app.fetch(new Request('http://localhost/_openapi.json'));
    if (!response.ok) return { skipped: `/_openapi.json responded ${response.status}` };

    // 无后端模式会返回 HTML（页面 fallback）而非 JSON —— 与 `generateOpenApiTypesFromServer`
    // 同一条判据，避免把 HTML 喂给 openapi-typescript 报出误导性的解析错误。
    if (!(response.headers.get('content-type') || '').includes('json')) return { skipped: 'no JSON response' };

    const schema = (await response.json()) as object;
    const filePath = await generateOpenApiTypes(schema, { outDir: join(cwd, buildDir) });
    return { filePath };
  } catch (err) {
    logger.warn(`Failed to generate OpenAPI types: ${err instanceof Error ? err.message : String(err)}`);
    return { skipped: 'generation failed' };
  } finally {
    // entry 会启动进程内运行时（cron / 队列 worker / 数据库），用完必须收尾（与 prerender 同理）
    try {
      await (mod.close as (() => Promise<void>) | undefined)?.();
    } catch {
      /* 收尾失败不影响构建结果 */
    }
  }
}
