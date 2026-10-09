/**
 * CLI 的退出入口。
 *
 * ## 为什么不能直接 `process.exit(code)`
 *
 * `process.exit()` 在 Windows 上会在事件循环仍有活跃异步句柄时立刻开始拆进程，这会踩到 Node 24 的
 * 一个竞态：ESM/TS loader 与未清理的 undici 连接在 close 阶段被并发释放，触发 libuv 断言，或者让
 * 进程停在那里既不退出也不崩溃。
 *
 * 本仓库 CI 的真实症状（run 37954075109，windows-latest / Node 24）：`ubean build` 已经
 * 打印了致命错误、随后**既不退出也不崩溃**，spawn 侧只能等满看门狗（120s）才失败。日志：
 *
 * ```text
 * Error: 构建未在 120000ms 内退出（挂住即为回归）
 * fixture: D:\a\ubean\ubean\packages\cli\test\fixtures\build-errors\config-not-constructible
 * 输出尾巴:
 *   Building ubean application...
 *   Class constructor Foo cannot be invoked without 'new'
 * ```
 *
 * 上游同类报告与各自的绕过方式：
 * - nodejs/node#56645 —— `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`，仅在
 *   Windows + `process.exit()` 紧跟异步工作后出现。#61999 修的是断言面（已随 Node 24.20.0 进入
 *   LTS），并没有修「不退出」这一面。
 * - pnpm/pnpm#12121 —— 退出前先销毁自己的 undici dispatcher。
 * - silverwind/updates#137 —— **不再调用 `process.exit()`**，改用 `process.exitCode` 让事件循环
 *   自然排空（其作者在 Node 26 上发现 50ms 延时仍不彻底）。
 *
 * ## 采用的策略
 *
 * 先设 `process.exitCode`（立刻生效，即使调用方不 await，退出码也是对的），然后用一个**不保活**的
 * 定时器给出 `EXIT_GRACE_MS` 宽限期等进程自然退出；只有宽限期用尽、进程仍活着时才回退到
 * `process.exit()`：
 * - 间歇故障路径（Windows）：进程自然排空，绕开竞态；
 * - 真挂住（tinypool worker 池、prerender 动态导入的 SSR entry）：最多多等 `EXIT_GRACE_MS`，
 *   之后仍由强制退出兜底 —— 与旧实现行为一致，只是晚 1.5s。
 *
 * 定时器必须 `unref()`：否则宽限期本身会把进程钉活满 1.5s，成功路径白白变慢。
 */

/** 自然退出的宽限期（ms）。超时才回退到强制退出。 */
export const EXIT_GRACE_MS = 1500;

/**
 * 退出 CLI。**不返回**：要么进程在宽限期内自然退出，要么宽限期后被强制退出。
 *
 * @param code 退出码
 */
export async function exitCli(code: number): Promise<never> {
  process.exitCode = code;
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, EXIT_GRACE_MS);
    timer.unref?.();
  });
  // 走到这里说明宽限期用尽而进程仍在：有东西钉住了事件循环，强制退出兜底。
  process.exit(code);
}
