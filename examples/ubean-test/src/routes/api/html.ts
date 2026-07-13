import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  return c.html(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>HTML Response Test</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
    h1 { color: #42b883; }
    .card { background: #f0f9f4; padding: 20px; border-radius: 8px; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>✅ HTML Response</h1>
  <div class="card">
    <p>This is an HTML response returned directly from an API route using <code>c.html()</code>.</p>
    <p>Timestamp: ${new Date().toISOString()}</p>
  </div>
</body>
</html>`);
});
