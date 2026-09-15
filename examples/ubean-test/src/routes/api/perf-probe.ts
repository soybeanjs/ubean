import { defineHandler } from 'ubean/server';

/**
 * 性能基准探针 —— 仅供 `scripts/benchmark-lifecycle.mjs`（RM-P04）读取，
 * 不是框架功能演示，也没有业务含义。
 *
 * 模块求值时固定下来的标识，用来判断热重载后这个模块是否被重新求值：
 * 修改一个**无关文件**触发 reload 后，`instance` 不变 ⇒ 模块实例被保留（单例语义），
 * 变了 ⇒ 整个模块图被重新求值。`pid` 用于区分「模块重新求值」与「进程重启」。
 */
const instance = Math.random().toString(36).slice(2, 10);
const evaluatedAt = Date.now();

/**
 * 热重载回归探针的**可改写字面量**：`packages/cli/test/dev-reload.test.ts` 会把它改成随机标记
 * 并断言响应里出现该标记，然后还原。改这个字面量必须能反映到响应里 —— 也就是「文件变更 →
 * 重扫 → 重建 app → 新路由生效」整条链路真的通，而不只是 Vite 自己重转了模块。
 */
const probeTag = 'initial';

export const GET = defineHandler(c => {
  return c.json({ instance, evaluatedAt, pid: process.pid, tag: probeTag });
});
