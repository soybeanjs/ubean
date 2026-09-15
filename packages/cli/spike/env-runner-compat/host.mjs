import { createServer, DevEnvironment } from 'vite';
import { NodeWorkerEnvRunner } from 'env-runner/runners/node-worker';
import { createViteHotChannel } from 'env-runner/vite';

const root = new URL('./project', import.meta.url).pathname;

// 1) 先起 worker（它等 host 消息）
const runner = new NodeWorkerEnvRunner({
  name: 'ubean',
  data: { entry: new URL('./worker.mjs', import.meta.url).pathname }
});
await runner.waitForReady(30_000);
console.log('worker ready:', JSON.stringify(runner.address));

// 2) 由 runner 的 IPC hooks 建 Vite HotChannel（对应 ADR §3）
const transport = createViteHotChannel(runner, 'ubean');

// 3) 起 vite dev server，用 dev.createEnvironment 把 transport 交给 DevEnvironment
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  server: { port: 0 },
  environments: {
    ubean: {
      consumer: 'server',
      dev: {
        createEnvironment: (name, config) => new DevEnvironment(name, config, { hot: true, transport })
      }
    }
  }
});
await server.listen();
console.log('vite dev server up; environments:', Object.keys(server.environments).join(','));

// 4) 经 worker 发起请求 → worker 内 ModuleRunner → 宿主 DevEnvironment 转换 → 求值
const res = await runner.fetch('http://localhost/spike');
console.log('status:', res.status, '| x-worker:', res.headers.get('x-worker'));
console.log('body:', await res.text());

await server.close();
await runner.close();
