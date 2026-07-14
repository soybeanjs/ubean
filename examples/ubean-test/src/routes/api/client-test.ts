import {
  defineHandler,
  get,
  post,
  put,
  patch,
  head,
  delete as deleteMethod,
  options as optionsMethod,
  $get,
  $post,
  $put,
  $delete as $deleteMethod,
  diagnoseEnvironment,
  createClient
} from 'ubean';

// Bypass HTTP proxy for localhost requests
const _origProxy = process.env.HTTP_PROXY;
const _origHttpsProxy = process.env.HTTPS_PROXY;
if (process.env.HTTP_PROXY) delete process.env.HTTP_PROXY;
if (process.env.HTTPS_PROXY) delete process.env.HTTPS_PROXY;
process.env.NO_PROXY = 'localhost,127.0.0.1';

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'info';
  const base = `http://localhost:${process.env.PORT || 3000}`;

  switch (action) {
    case 'env': {
      return c.json(diagnoseEnvironment());
    }

    case 'methods': {
      const results: Record<string, unknown> = {};
      const errors: Record<string, string> = {};

      async function testMethod(name: string, fn: () => Promise<unknown>) {
        try {
          results[name] = await fn();
        } catch (e) {
          errors[name] = e instanceof Error ? e.message : String(e);
        }
      }

      await testMethod('get', () => get(`${base}/api/hello`));
      await testMethod('$get', () => $get(`${base}/api/hello`));
      await testMethod('post', () =>
        post(
          `${base}/api/users`,
          { name: 'Client Test', email: 'client@test.com', role: 'user' },
          { headers: { 'Content-Type': 'application/json' } }
        )
      );
      await testMethod('$post', () =>
        $post(
          `${base}/api/users`,
          { name: 'Flat Client', email: 'flat@test.com', role: 'user' },
          { headers: { 'Content-Type': 'application/json' } }
        )
      );
      await testMethod('put', () =>
        put(`${base}/api/users/1`, { name: 'Updated Name' }, { headers: { 'Content-Type': 'application/json' } })
      );
      await testMethod('$put', () =>
        $put(`${base}/api/users/2`, { name: 'Flat Updated' }, { headers: { 'Content-Type': 'application/json' } })
      );
      await testMethod('patch', () =>
        patch(`${base}/api/users/1`, { name: 'Patched' }, { headers: { 'Content-Type': 'application/json' } })
      );
      await testMethod('delete', () => deleteMethod(`${base}/api/users/999`));
      await testMethod('$delete', () => $deleteMethod(`${base}/api/users/888`));

      return c.json({
        testedMethods: ['get', '$get', 'post', '$post', 'put', '$put', 'patch', 'delete', '$delete'],
        successCount: Object.keys(results).length,
        errorCount: Object.keys(errors).length,
        results,
        errors
      });
    }

    case 'interceptors': {
      const log: string[] = [];
      const client = createClient({
        baseURL: base,
        headers: { 'X-Custom-Header': 'test-value' },
        onRequest({ options }) {
          log.push(`onRequest: ${options.method || 'GET'}`);
          options.headers = { ...options.headers, 'X-Intercepted': 'true' };
        },
        onResponse({ response }) {
          log.push(`onResponse: ${response.status}`);
        },
        onRequestError({ error }) {
          log.push(`onRequestError: ${error.message}`);
        },
        onResponseError({ error }) {
          log.push(`onResponseError: ${error?.message}`);
        }
      });

      const data = await client.get('/api/hello');
      return c.json({
        data,
        interceptorLog: log,
        hasOnRequest: log.some(l => l.startsWith('onRequest')),
        hasOnResponse: log.some(l => l.startsWith('onResponse'))
      });
    }

    case 'head': {
      const headResult = await head(`${base}/api/hello`);
      const optionsResult = await optionsMethod(`${base}/api/hello`);
      return c.json({
        head: headResult,
        options: optionsResult,
        note: 'head/options methods executed successfully'
      });
    }

    case 'flatResponse': {
      const successResult = await $get(`${base}/api/hello`);
      try {
        await $get(`${base}/api/nonexistent`);
      } catch {
        // $get should return {data, error, status} not throw
      }
      const errorFlat = await $get(`${base}/api/nonexistent`).catch(() => null);
      return c.json({
        success: successResult,
        hasData: successResult.data !== undefined,
        hasError: successResult.error !== undefined,
        hasStatus: successResult.status !== undefined,
        errorFlat
      });
    }

    case 'extend': {
      const extended = createClient({ baseURL: base }).extend({
        headers: { 'X-Extended': 'true' }
      });
      const data = await extended.get('/api/hello');
      return c.json({
        data,
        isExtended: typeof extended.get === 'function'
      });
    }

    default:
      return c.json({
        actions: ['env', 'methods', 'interceptors', 'head', 'flatResponse', 'extend']
      });
  }
});
