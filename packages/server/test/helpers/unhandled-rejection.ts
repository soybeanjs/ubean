/**
 * TS-34 红证基础设施：断言一段代码跑完**没有**产生未处理的异步错误。
 *
 * 为什么需要它：`Promise.resolve(fn())` 这个写法里 `fn()` 在包装之前就被求值，
 * 所以 hook **同步**抛错会逃出 `.catch(() => {})`。逃出去的表现取决于调用位置：
 *   - 直接在异步调用路径上（`handleMessage` 等）→ 同步抛出，调用方自己炸；
 *   - 在 `queueMicrotask` 里（`hooks.open` / `onConnect`）→ 冒泡成 **uncaughtException**，
 *     vitest 只报 `Errors 1 error` 而 `Test Files 1 passed`。
 * 「没报错」本身不是断言 —— 把修复回退掉时用例必须**真的 failed**。这里同时监听
 * `process` 的 `unhandledRejection` 与 `uncaughtException`，收到任何一条就断言失败。
 */
import { expect } from 'vitest';

/** 把事件循环推进到 Node 判定「这个错误没人处理」的那一步。 */
async function drainEventLoop(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setImmediate(resolve));
  }
}

const describeReason = (reason: unknown): string => {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  return String(reason);
};

export async function expectNoUnhandledRejection(run: () => void | Promise<void>): Promise<void> {
  const seen: string[] = [];
  const onUnhandled = (reason: unknown) => seen.push(`unhandledRejection → ${describeReason(reason)}`);
  const onUncaught = (error: unknown) => seen.push(`uncaughtException → ${describeReason(error)}`);

  process.on('unhandledRejection', onUnhandled);
  process.on('uncaughtException', onUncaught);
  let syncThrow: string | undefined;
  try {
    await run();
    await drainEventLoop();
  } catch (error) {
    syncThrow = describeReason(error);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    process.off('uncaughtException', onUncaught);
  }

  expect({ syncThrow, async: seen }).toEqual({ syncThrow: undefined, async: [] });
}
