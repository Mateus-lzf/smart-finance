export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const parsedOrigin = new URL(origin);
    const requestOrigin = new URL(request.url).origin;
    return (
      parsedOrigin.origin === requestOrigin &&
      parsedOrigin.origin === origin &&
      parsedOrigin.username === "" &&
      parsedOrigin.password === "" &&
      parsedOrigin.pathname === "/" &&
      parsedOrigin.search === "" &&
      parsedOrigin.hash === ""
    );
  } catch {
    return false;
  }
}
