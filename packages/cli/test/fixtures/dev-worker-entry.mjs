// RM-V08 测试用 worker 入口：worker 内跑 Hono app，并经 ModuleRunner 向宿主取模块。
//
// 注意 env-runner 的 worker 约定：`createViteTransport(sendMessage, onMessage, envName)` 的第二个
// 参数是**监听器注册函数**，必须把它接到 worker 的 `ipc.onMessage` 上 —— 只存下回调不注册，
// 宿主回发的 `vite:invoke` 应答会被丢弃，表现为 worker 侧 60s 超时。
import { threadId } from 'node:worker_threads';
import { Hono } from 'hono';
import { createViteTransport } from 'env-runner/vite';
import { ModuleRunner, ESModulesEvaluator } from 'vite/module-runner';

const app = new Hono();
// `node-worker` 是 worker 线程：pid 与宿主相同，隔离要看 threadId（主线程为 0）
app.get('/api/ping', c => c.json({ from: 'worker', threadId, pid: process.pid }));

const transportListeners = [];
let moduleRunner;

async function handle(request) {
  // 触发一次 vite:invoke 往返（宿主转换 /src/answer.ts），验证 invoke bridge
  const mod = await moduleRunner.import('/src/answer.ts');
  const url = new URL(request.url);
  if (url.pathname === '/api/module') {
    return Response.json({ evaluated: mod.answer, threadId, pid: process.pid });
  }
  return app.fetch(request);
}

export default {
  async fetch(request) {
    try {
      return await handle(request);
    } catch (error) {
      // 失败时把错误带回宿主，避免只看到一个空 500
      return new Response(`WORKER-ERROR: ${error?.stack || error}`, { status: 599 });
    }
  },
  ipc: {
    onOpen({ sendMessage }) {
      moduleRunner = new ModuleRunner(
        { transport: createViteTransport(sendMessage, listener => transportListeners.push(listener), 'ubean') },
        new ESModulesEvaluator()
      );
    },
    onMessage(message) {
      for (const listener of transportListeners) listener(message);
    }
  }
};
