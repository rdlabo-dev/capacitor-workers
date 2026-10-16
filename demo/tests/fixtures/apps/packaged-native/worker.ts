// Only the test runner is added here; the selected framework Worker is unchanged.
import worker from "selected-worker";
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
