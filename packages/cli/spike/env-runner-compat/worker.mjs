import { createViteTransport } from 'env-runner/vite';
import { ModuleRunner, ESModulesEvaluator } from 'vite/module-runner';

let moduleRunner;
let sendToHost;

export default {
  async fetch(request) {
    if (!moduleRunner) return new Response('runner not ready', { status: 503 });
    try {
      const mod = await moduleRunner.import('/src/entry.ts');
      const response = mod.handler(request);
      return new Response(`[worker ${process.pid}] ${await response.text()} answer=${mod.answer}`, {
        status: 200,
        headers: { 'x-worker': 'yes' }
      });
    } catch (error) {
      return new Response(`WORKER-ERROR: ${error?.stack || error}`, { status: 599 });
    }
  },
  ipc: {
    onOpen({ sendMessage }) {
      sendToHost = sendMessage;
      moduleRunner = new ModuleRunner(
        { transport: createViteTransport(sendMessage, registerListener, 'ubean') },
        new ESModulesEvaluator()
      );
    },
    onMessage() {}
  }
};

let listener;
function registerListener(received) {
  listener = received;
}
