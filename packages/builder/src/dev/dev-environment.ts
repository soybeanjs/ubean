/**
 * `UbeanDevEnvironment`（RM-V08，ADR-0012 §3）。
 *
 * 形态：宿主侧保留一个继承 Vite `DevEnvironment` 的环境，`dispatchFetch(request)` 把请求转发进
 * env-runner 的 worker（对齐 `nitro/src/build/vite/dev.ts:93-164` 的形态）。
 *
 * **当前状态（2026-09-16 核对）**：本类**没有接进实际 dev 路径** —— `createEnvironment` 全仓无
 * 接线点，RM-V14 收敛后的 `dev-vite.ts` 走的是「插件自举宿主 app + 请求路由中间件」（`getDevApp`
 * 在**主进程**里跑 SSR 模块图）。因此「dev 下服务端代码在 worker 里执行」目前**不成立**，本模块
 * 与它的测试（`dev-environment.test.ts` / `dev-worker.test.ts`）验证的是能力与 IPC 契约，不是线上
 * 行为。Phase 4 的 RM-V28（跨环境单例代理）与 RM-V29（services 环境机制）都服务于这套多环境
 * 拓扑，在拓扑被采用之前不落地 —— 结论与理由见 docs/vite-plugin-migration.md。
 *
 * 分工（依据 `docs/env-runner-spike.md` §7 的实测结论）：
 * - **Vite 自己**负责模块图语义与 `vite:invoke` 的分发 —— `DevEnvironment` 构造时会把传入的
 *   transport 规范化，并挂到 `environment.hot`（`NormalizedHotChannel`）上，其
 *   `handleInvoke()` 是公开方法，不需要我们复刻；
 * - **env-runner** 只负责「跑起 worker + 一条 IPC」。
 *
 * 因此本模块只做两件薄事：把宿主 → worker 的 payload 送出（transport），把 worker → 宿主的
 * `vite:invoke` 交给 Vite 计算后按约定回发（bridge）。
 */
import { DevEnvironment } from 'vite';
import type { DevEnvironmentContext, HotChannel, HotPayload, ResolvedConfig } from 'vite';

/**
 * env-runner runner 在本模块用到的最小面。
 *
 * 只声明用到的成员而不是 `import type { EnvRunner } from 'env-runner'`：builder 包不必为了
 * dev 环境把 env-runner 拉进类型依赖，任何满足该形状的 runner 都能用。
 */
export interface EnvRunnerLike {
  sendMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  /** 把请求交给 worker 内的 handler（env-runner 的 `FetchHandler` 直接接受 `Request`）。 */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

/** 与 worker 侧 `createViteTransport(sendMessage, onMessage, envName)` 必须一致。 */
export const UBEAN_DEV_ENV_NAME = 'ubean';

/**
 * 宿主 → worker 的 transport 适配器。
 *
 * 只实现 Vite `HotChannel` 里能实现的部分：`send` 把 payload 送到 worker，`on`/`off` 维护
 * 本地监听表。`skipFsCheck` 置真 —— 同进程 IPC 不是网络通道，无需 fs 访问检查。
 * Vite 会在 `DevEnvironment` 构造时把它规范化（补 `setInvokeHandler` / `handleInvoke`）。
 */
export function createEnvRunnerTransport(runner: EnvRunnerLike, envName: string = UBEAN_DEV_ENV_NAME): HotChannel {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    skipFsCheck: true,
    send(payload: HotPayload) {
      runner.sendMessage(tagForEnv(payload, envName));
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener);
    },
    api: {}
  } as unknown as HotChannel;
}

/**
 * 把 worker 发来的 `vite:invoke` 交给 Vite 计算并回发。
 *
 * 回发结构照抄 vite-plus 自己的实现（`dist/vite/node/chunks/node.js:32291-32313`）：
 * 应答 id 由 `send*` 改成 `response*`，`data` 为 `handleInvoke()` 的 `{ result }` / `{ error }`。
 * **必须在 `DevEnvironment` 构造之后调用** —— 那时 `environment.hot` 才存在。
 */
export function bridgeEnvRunnerInvokes(
  environment: DevEnvironment,
  runner: EnvRunnerLike,
  envName: string = UBEAN_DEV_ENV_NAME
): void {
  runner.onMessage(async message => {
    const payload = message as { type?: string; event?: string; data?: { id?: string; name?: string } } | undefined;
    const inner = payload?.data;
    if (payload?.type !== 'custom' || payload.event !== 'vite:invoke' || !inner?.id) return;

    const outcome = await environment.hot.handleInvoke({
      type: 'custom',
      event: 'vite:invoke',
      data: inner
    } as HotPayload);
    // 回发必须带 `viteEnv` —— env-runner 用它做命名空间过滤（worker 侧会丢弃未标记的消息）
    runner.sendMessage(
      tagForEnv(
        {
          type: 'custom',
          event: 'vite:invoke',
          data: {
            name: inner.name,
            id: inner.id.replace('send', 'response'),
            data: outcome
          }
        },
        envName
      )
    );
  });
}

/**
 * env-runner 按 `viteEnv` 给消息分命名空间（`env-runner/dist/vite.mjs`）：worker 侧
 * `createViteTransport` 只接受带本环境名的消息。宿主发出的任何 payload 都必须打上该标记，
 * 否则会被静默丢弃 —— 表现为 worker 侧 invoke 长时间无应答。
 */
function tagForEnv(payload: unknown, envName: string): unknown {
  return { ...(payload as Record<string, unknown>), viteEnv: envName };
}

export class UbeanDevEnvironment extends DevEnvironment {
  readonly #runner: EnvRunnerLike;

  constructor(name: string, config: ResolvedConfig, context: DevEnvironmentContext, runner: EnvRunnerLike) {
    super(name, config, {
      ...context,
      transport: context.transport ?? createEnvRunnerTransport(runner, name)
    });
    this.#runner = runner;
    bridgeEnvRunnerInvokes(this, runner, name);
  }

  /**
   * ADR-0012 §3：框架请求入口把 Web `Request` 转发进 worker 内的 Hono app。
   * 宿主进程不再执行服务端代码，因此服务端崩溃不会带走 dev server。
   */
  async dispatchFetch(request: Request): Promise<Response> {
    return this.#runner.fetch(request);
  }
}

/**
 * 生成 `environments.<name>.dev.createEnvironment` 需要的工厂（RM-V09 的能力，**尚未接线** ——
 * 全仓没有 `createEnvironment` 的注册点，原因见文件头「当前状态」）。
 */
export function createUbeanDevEnvironmentFactory(runner: EnvRunnerLike) {
  return (name: string, config: ResolvedConfig, context: DevEnvironmentContext): UbeanDevEnvironment =>
    new UbeanDevEnvironment(name, config, context, runner);
}
