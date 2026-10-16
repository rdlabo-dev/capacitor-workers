// Native Android document transport. Bundled assets bypass the Worker router.
const baseURL = new URL(self.location.href).searchParams.get("baseURL");
// Read the current manifest: a previously installed SW can outlive an app update.
function assets() {
  return fetch("/capacitor-workers-assets.json", { cache: "no-store" }).then(
    (response) => {
      if (!response.ok) throw new Error("Missing document assets manifest");
      return response.json();
    },
  );
}
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
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    assets().then((paths) => {
      if (
        paths.includes(url.pathname) ||
        url.pathname.startsWith("/_capacitor_")
      )
        return fetch(event.request);
      return dispatch(event.request);
    }),
  );
});
async function dispatch(request) {
  const deadline = Date.now() + 10000;
  let host = (
    await self.clients.matchAll({ type: "window", includeUncontrolled: true })
  ).find((client) =>
    new URL(client.url).searchParams.has("__capacitor_workers_host"),
  );
  // An installed SW survives process restarts. Let the bundled entry restart the
  // native host before intercepting its first document, without a network server.
  if (!host && request.mode === "navigate" && request.method === "GET")
    return fetch(new URL("/index.html", self.location.origin).href, {
      cache: "no-store",
    });
  while (!host) {
    host = (
      await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    ).find((client) =>
      new URL(client.url).searchParams.has("__capacitor_workers_host"),
    );
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
  if (
    [301, 302, 303, 307, 308].includes(result.status) &&
    headers.has("location")
  ) {
    const target = new URL(headers.get("location"), result.url);
    if (target.origin !== baseURL)
      throw new Error("External redirects are not supported");
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
