// Android's native interceptor cannot expose request bodies or return redirects.
// Keep those semantics in the browser's standard FetchEvent pipeline.
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    !/^\/(pages|api)\//.test(url.pathname)
  )
    return;
  event.respondWith(dispatch(event.request));
});
async function dispatch(request) {
  const deadline = Date.now() + 10000;
  let host;
  while (!host) {
    host = (
      await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    ).find((client) => new URL(client.url).pathname === "/runtime.html");
    if (Date.now() > deadline) throw new Error("Worker host unavailable");
    if (!host) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.clone().arrayBuffer();
  const message = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers),
    body,
  };
  const channel = new MessageChannel();
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("Worker response timeout"));
    }, 30000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data);
    };
    host.postMessage(message, [channel.port2]);
  });
  if (result.error) throw new Error(result.error);
  const headers = new Headers(result.headers);
  if (headers.has("location")) {
    const target = new URL(headers.get("location"), result.url);
    if (target.origin !== "https://worker.invalid")
      throw new Error("External redirects are outside this experiment");
    headers.set(
      "location",
      self.location.origin + target.pathname + target.search + target.hash,
    );
  }
  return new Response(
    [101, 204, 205, 304].includes(result.status) ? null : result.body,
    { status: result.status, headers },
  );
}
