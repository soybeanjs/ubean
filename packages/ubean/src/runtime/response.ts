export function redirect(location: string, statusCode: 301 | 302 | 303 | 307 | 308 = 302): Response {
  return new Response(null, { status: statusCode, headers: { Location: location } });
}

export function permanentRedirect(location: string): Response {
  return redirect(location, 301);
}
