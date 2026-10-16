// Test-only wrapper: injects the verification driver into the upstream HTML
// pages. The upstream application itself is resolved through the
// "upstream-worker" alias in the consumer's Vite config and stays unchanged.
import worker from "upstream-worker";

export default {
  async fetch(request: Request, env: unknown, ctx: any) {
    const response = await worker.fetch(request, env, ctx);
    if (!response.headers.get("content-type")?.includes("text/html"))
      return response;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    const html = (await response.text()).replace(
      "</body>",
      '<script src="/probe.js" defer></script></body>',
    );
    return new Response(html, { status: response.status, headers });
  },
};
