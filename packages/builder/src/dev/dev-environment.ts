/**
 * `UbeanDevEnvironment`（RM-V08，ADR-0012 §3）。
 *
 * dev 下服务端代码在 **env-runner 的 worker** 里执行：宿主侧只保留一个继承 Vite
 * `DevEnvironment` 的环境，`dispatchFetch(request)` 把请求转发进 worker（对齐
 * `nitro/src/build/vite/dev.ts:93-164` 的形态）。
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
 * 生成 `environments.<name>.dev.createEnvironment` 需要的工厂（RM-V09 wiring 用）。
 */
export function createUbeanDevEnvironmentFactory(runner: EnvRunnerLike) {
  return (name: string, config: ResolvedConfig, context: DevEnvironmentContext): UbeanDevEnvironment =>
    new UbeanDevEnvironment(name, config, context, runner);
}
