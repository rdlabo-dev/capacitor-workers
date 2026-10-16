export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/echo")
      return Response.json({
        method: request.method,
        query: url.searchParams.get("q"),
        header: request.headers.get("x-test"),
        body: await request.text(),
      });
    if (url.pathname === "/api/status")
      return new Response(request.method === "HEAD" ? null : "accepted", {
        status: 202,
        headers: { "x-test": "kept" },
      });
    return new Response("missing", { status: 404 });
  },
};
