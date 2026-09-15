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

export const GET = defineHandler(c => {
  return c.json({ instance, evaluatedAt, pid: process.pid });
});
