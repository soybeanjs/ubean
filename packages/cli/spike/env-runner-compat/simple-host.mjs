import { NodeWorkerEnvRunner } from 'env-runner/runners/node-worker';

const runner = new NodeWorkerEnvRunner({
  name: 'simple',
  data: { entry: new URL('./simple-worker.mjs', import.meta.url).pathname }
});
await runner.waitForReady(30_000);
const res = await runner.fetch('http://localhost/minimal');
console.log('最小 worker fetch →', res.status, '| body:', await res.text());
await runner.close();
