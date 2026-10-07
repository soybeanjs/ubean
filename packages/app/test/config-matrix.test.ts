/**
 * TS-14：配置组合矩阵（`it.each` 生成）。
 *
 * 现状是「只测一条主链」（fullstack + node + ssr + prefix_except_default + 全开），于是**配置之间
 * 的相互作用**没有任何一层守着。这里只取 §6 判定的**交互闭包**（两字段是否改变同一条响应），
 * 并且每一格断言的都是**配置效果**（响应头 / 状态码 / 响应体 / 中间件序列），不是把配置对象读回来。
 *
 * 本文件覆盖 TS-14 做法里的两组（都是纯运行期语义，可在进程内观察，无需构建）：
 * 1. `security` × `csrf` × `dataCache` 三关的 8 种组合 —— 行为断言（头出现/不出现、CSRF 拦/不拦、
 *    dataCache 步骤在场/缺席）。与 TS-07 的 `/_health` `mwOrder` 观测联动，缺席必须可见。
 * 2. `ssr` 优先级链端到端：`definePage({ssr})` > `routeRule.ssr` > 全局 `ssr.exclude`。
 *    各层单测已有（`packages/routes/src/select-ssr.ts` 是纯函数），**链没有端到端**，这里补的
 *    正是「三层同时在场时谁赢」以及「glob exclude 与显式 `ssr: false` 的语义差别」。
 *
 * 关于层界（为什么这一组放在 `@ubean/app` 而不是 CLI 构建层）：
 * - 运行期语义（本文件）在进程内可完整观察，每格毫秒级 —— 因此能覆盖全部 8 格组合。
 * - **配置字段名 → app 选项名**的映射（`config.security.headers` → `options.securityHeaders`、
 *   `config.security.csrf` → `options.csrf`、`config.dataCache` → `options.dataCache`）不在这里
 *   证明：那是构建/装配层的职责，由 TS-12 的**真实产物**断言覆盖（`preset-runtime-app` 的
 *   `security: { csrf: { mode: 'token' } }` 在 9 个 preset 的产物里实测给出 403/200）。
 *   本文件只证明「选项一旦到位，组合起来的效果是什么」。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearInternalFetcher } from '@ubean/routes';
import { clearGlobalHooks } from '../src/hooks';
import { UbeanApp } from '../src/app';
import type { ScannedPageRoute, UbeanAppOptions } from '../src/app';

const ORIGIN = 'http://localhost';

const send = (app: UbeanApp, path: string, init?: RequestInit): Promise<Response> =>
  app.hono.fetch(new Request(ORIGIN + path, init ?? {}));

async function middlewareSteps(app: UbeanApp): Promise<string[]> {
  const res = await send(app, '/_health');
  const body = (await res.json()) as { mwOrder?: string[] };
  return body.mwOrder ?? [];
}

beforeEach(() => {
  clearGlobalHooks();
  clearInternalFetcher();
});

afterEach(() => {
  clearGlobalHooks();
  clearInternalFetcher();
});

/* -------------------------------------------------------------------------- */
/* 组 1：security × csrf × dataCache 三关（8 格）                              */
/* -------------------------------------------------------------------------- */

const ON_OFF = [false, true] as const;

const TOGGLE_CASES = ON_OFF.flatMap(securityHeaders =>
  ON_OFF.flatMap(csrf =>
    ON_OFF.map(dataCache => ({ securityHeaders, csrf, dataCache, label: `${+securityHeaders}${+csrf}${+dataCache}` }))
  )
);

describe('TS-14 · security × csrf × dataCache 三关组合', () => {
  it.each(TOGGLE_CASES)(
    'securityHeaders=$securityHeaders csrf=$csrf dataCache=$dataCache',
    async ({ securityHeaders, csrf, dataCache }) => {
      const app = new UbeanApp({
        securityHeaders,
        csrf: csrf ? { mode: 'token' } : false,
        dataCache,
        i18nConfig: { defaultLocale: 'en', locales: ['en'] }
      });
      app.hono.post('/api/echo', c => c.json({ ok: true }));

      // ① securityHeaders：断言**响应头**，不是读配置。
      const health = await send(app, '/_health');
      if (securityHeaders) {
        expect(health.headers.get('x-content-type-options')).toBe('nosniff');
        expect(health.headers.get('content-security-policy')).toContain("default-src 'self'");
      } else {
        expect(health.headers.get('x-content-type-options')).toBeNull();
        expect(health.headers.get('content-security-policy')).toBeNull();
      }

      // ② csrf：**同一条 POST**，两端期望不同 —— 这是「拦截确实发生/确实没发生」的判据，
      //    而不是「中间件有没有注册」。
      const post = await send(app, '/api/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      expect(post.status).toBe(csrf ? 403 : 200);
      if (!csrf) expect(await post.json()).toEqual({ ok: true });

      // ③ dataCache：步骤在场/缺席（缺席要可见，不是静默）。
      const steps = await middlewareSteps(app);
      expect(steps.includes('dataCache')).toBe(dataCache);

      // ④ 组合不影响常驻步骤：关掉的门控整段缺席，其余保持全序（不重排）。
      //    本用例传了 `i18nConfig`，故 `i18n` 在场；未传 `routeRules`/fs cacheStore，
      //    故 `routeRules`/`routeCache`/`cacheStore` 三段缺席。
      const FULL = [
        'handle',
        'requestId',
        'actionContext',
        'securityHeaders',
        'csrf',
        'dataCache',
        'i18n',
        'websocket',
        'lifecycle',
        'healthEndpoint'
      ];
      const expected = FULL.filter(
        step =>
          (step !== 'securityHeaders' || securityHeaders) &&
          (step !== 'csrf' || csrf) &&
          (step !== 'dataCache' || dataCache)
      );
      expect(steps).toEqual(expected);
    }
  );
});

/* -------------------------------------------------------------------------- */
/* 组 2：ssr 优先级链端到端                                                    */
/* -------------------------------------------------------------------------- */

const SSR_MARKER = '<div id="ssr-ran">SSR</div>';

type SsrValue = boolean | 'streaming' | 'data-only';

interface SsrCase {
  name: string;
  pageSsr?: SsrValue;
  ruleSsr?: SsrValue;
  ppr?: boolean;
  exclude?: boolean;
  streaming?: boolean;
  /** 期望的 `X-SSR-Mode` */
  mode: 'ssr' | 'streaming' | 'data-only' | 'csr';
  /** 期望 loader 是否执行 */
  runsLoader: boolean;
  /** 期望 SSR 渲染器是否执行（响应体里出现 SSR_MARKER） */
  renders: boolean;
}

/**
 * 每一格都是一条**优先级/语义**断言，不是「配置能被读出来」。
 * 期望值取自 `packages/routes/src/select-ssr.ts` 的契约文档，并逐格实测确认。
 */
const SSR_CASES: SsrCase[] = [
  { name: '三层都缺省 → ssr', mode: 'ssr', runsLoader: true, renders: true },
  {
    name: 'page.ssr=false 胜过 routeRule.ssr=true → csr，且 loader 不跑',
    pageSsr: false,
    ruleSsr: true,
    mode: 'csr',
    runsLoader: false,
    renders: false
  },
  {
    name: 'page.ssr=true 胜过 routeRule.ssr=false → ssr',
    pageSsr: true,
    ruleSsr: false,
    mode: 'ssr',
    runsLoader: true,
    renders: true
  },
  {
    name: 'page.ssr=data-only 胜过 routeRule.ssr=true → data-only',
    pageSsr: 'data-only',
    ruleSsr: true,
    mode: 'data-only',
    runsLoader: true,
    renders: false
  },
  {
    name: 'routeRule.ssr=data-only（无 page 覆盖）→ data-only',
    ruleSsr: 'data-only',
    mode: 'data-only',
    runsLoader: true,
    renders: false
  },
  {
    name: 'routeRule.ssr=false（无 page 覆盖）→ csr，且 loader 不跑',
    ruleSsr: false,
    mode: 'csr',
    runsLoader: false,
    renders: false
  },
  {
    name: '全局 ssrExclude 命中 → csr，但 loader 仍跑（与显式 ssr:false 语义不同）',
    exclude: true,
    mode: 'csr',
    runsLoader: true,
    renders: false
  },
  {
    name: 'routeRule.ppr=true → streaming（强制流式）',
    ppr: true,
    mode: 'streaming',
    runsLoader: true,
    renders: true
  },
  {
    name: '全局 streaming=true 且无覆盖 → streaming',
    streaming: true,
    mode: 'streaming',
    runsLoader: true,
    renders: true
  }
];

function makeSsrApp(c: SsrCase): { app: UbeanApp; loaderCalls: number[] } {
  const loaderCalls: number[] = [];
  const page: ScannedPageRoute = {
    fullPath: 'p.vue',
    relativePath: 'p.vue',
    dirname: '',
    basename: 'p.vue',
    name: 'P',
    route: '/p',
    path: '/p',
    isReuse: false,
    isMarkdown: false,
    ...(c.pageSsr === undefined ? {} : { pageMeta: { ssr: c.pageSsr } })
  };

  const routeRules: UbeanAppOptions['routeRules'] =
    c.ruleSsr === undefined && !c.ppr
      ? undefined
      : { '/p': { ...(c.ruleSsr === undefined ? {} : { ssr: c.ruleSsr }), ...(c.ppr ? { ppr: true } : {}) } };

  const app = new UbeanApp({
    pages: [page],
    routeRules,
    ssrExclude: c.exclude ? ['/p'] : undefined,
    streaming: c.streaming,
    pageLoaders: {
      'p.vue': async () => ({
        loader: async () => {
          loaderCalls.push(loaderCalls.length + 1);
          return { n: loaderCalls.length };
        }
      })
    },
    // 假渲染器：只在 `useRenderer` 为真时才会被调用，于是「响应体里有没有 marker」就是
    // 「SSR 渲染确实发生了」的判据（`renderPage` 在 renderer 为 null 时走 client-only shell）。
    pageRenderer: { render: async () => SSR_MARKER }
  });

  return { app, loaderCalls };
}

describe('TS-14 · ssr 优先级链端到端（definePage > routeRule > ssr.exclude）', () => {
  it.each(SSR_CASES)('$name', async c => {
    const { app, loaderCalls } = makeSsrApp(c);
    await app.init();

    const res = await send(app, '/p');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('x-ssr-mode')).toBe(c.mode);
    expect(html.includes(SSR_MARKER), `SSR 渲染是否发生（mode=${c.mode}）`).toBe(c.renders);
    expect(loaderCalls.length > 0, 'loader 是否执行').toBe(c.runsLoader);
  });
});
