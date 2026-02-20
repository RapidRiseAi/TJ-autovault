export function shouldBypassMiddlewareForRequest(headers: Headers): boolean {
  return headers.has('next-action');
}
