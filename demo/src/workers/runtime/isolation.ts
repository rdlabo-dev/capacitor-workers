// The same module is exercised in workerd and a Dedicated Web Worker.
interface Env {
  UPSTREAM: string;
}
interface Context {
  waitUntil(promise: Promise<unknown>): void;
}
let cancelled = 0;
let aborted = 0;
let active = 0;

export default {
  async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/api/outbound": {
        await Promise.resolve();
        const upstream = await fetch(
          `${env.UPSTREAM}/api/upstream.txt?id=${url.searchParams.get("id")}`,
        );
        ctx.waitUntil(
          Promise.resolve().then(async () => {
            const background = await fetch(
              `${env.UPSTREAM}/api/background.txt`,
              { method: "POST" },
            );
            if ((await background.text()) !== "background completed")
              throw new Error("Unexpected background response");
          }),
        );
        return Response.json({
          upstream: await upstream.text(),
          url: request.url,
          dom: "document" in globalThis,
        });
      }
      case "/api/upstream.txt":
        return new Response(
          "WRONG: outbound fetch re-entered the local handler",
          { status: 500 },
        );
      case "/api/echo":
        return new Response(await request.arrayBuffer(), {
          headers: { "x-runtime": "local" },
        });
      case "/api/status":
        return new Response("ok", { status: 202, statusText: "Queued" });
      case "/api/cancel-failure":
        return new Response(
          new ReadableStream({
            cancel() {
              throw new Error("expected cancellation failure");
            },
          }),
        );
      case "/api/stream":
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("first"));
            },
            cancel() {
              cancelled++;
            },
          }),
        );
      case "/api/abort":
        return new Promise((_resolve, reject) => {
          active++;
          const stop = () => {
            active--;
            aborted++;
            reject(request.signal.reason);
          };
          if (request.signal.aborted) stop();
          else request.signal.addEventListener("abort", stop, { once: true });
        });
      case "/api/stats":
        return Response.json({ cancelled, aborted, active });
      case "/api/failure":
        throw new TypeError("expected worker failure");
      default:
        return new Response("missing", { status: 404 });
    }
  },
};
