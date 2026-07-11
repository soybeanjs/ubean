export function redirect(location: string, statusCode = 302): Response {
  return new Response(null, { status: statusCode, headers: { Location: location } });
}

export function permanentRedirect(location: string): Response {
  return redirect(location, 301);
}

export function html(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    ...init,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...init?.headers }
  });
}

export function json<T>(data: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  });
}

export function text(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    ...init,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...init?.headers }
  });
}

export function setHeader(c: any, name: string, value: string): void {
  c.header(name, value);
}

export function setHeaders(c: any, headers: Record<string, string>): void {
  for (const [k, v] of Object.entries(headers)) c.header(k, v);
}
