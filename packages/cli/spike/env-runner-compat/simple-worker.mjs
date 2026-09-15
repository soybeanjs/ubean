export default {
  fetch(request) {
    return Response.json({ ok: true, pid: process.pid, url: request.url, runtime: 'node-worker' });
  }
};
