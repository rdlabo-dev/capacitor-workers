import type { WorkerHandler } from "@rdlabo/capacitor-workers";

/** Disposable experiment, not a public library API or production transport. */
export function createIsolatedWorker() {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  const releases = new Set<() => void>();
  const handler: WorkerHandler<{ UPSTREAM: string }> = {
    async fetch(request, env, ctx) {
      request.signal.throwIfAborted();
      const body = request.body ? await request.arrayBuffer() : null;
      request.signal.throwIfAborted();
      return new Promise<Response>((resolve, reject) => {
        const { port1, port2 } = new MessageChannel();
        let done!: () => void;
        ctx.waitUntil(
          new Promise<void>((resolve) => {
            done = resolve;
          }),
        );
        const abort = () => {
          port1.postMessage("abort");
          reject(request.signal.reason);
        };
        const fail = (event: ErrorEvent) => {
          reject(new Error(event.message));
          done();
        };
        const release = () => {
          request.signal.removeEventListener("abort", abort);
          worker.removeEventListener("error", fail);
          port1.close();
          done();
          reject(new Error("Experiment worker terminated"));
        };
        releases.add(release);
        request.signal.addEventListener("abort", abort, { once: true });
        worker.addEventListener("error", fail);
        port1.onmessage = ({ data }) => {
          if (data.type === "response")
            resolve(
              new Response(data.body, {
                status: data.status,
                headers: data.headers,
              }),
            );
          if (data.type === "error") {
            const error = new Error(data.message);
            error.name = data.name;
            reject(error);
          }
          if (data.type === "done") {
            for (const error of data.errors)
              ctx.waitUntil(Promise.reject(new Error(error)));
            done();
          }
        };
        try {
          worker.postMessage(
            {
              port: port2,
              url: request.url,
              method: request.method,
              headers: [...request.headers],
              body,
              env,
            },
            body ? [port2, body] : [port2],
          );
        } catch (error) {
          reject(error);
          release();
        }
      });
    },
  };
  return {
    handler,
    dispose() {
      for (const release of releases) release();
      releases.clear();
      worker.terminate();
    },
  };
}
