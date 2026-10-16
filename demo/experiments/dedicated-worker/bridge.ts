import type { WorkerHandler } from "@rdlabo/capacitor-workers";
import type { Command, Reply } from "./protocol";

/** Experimental transport; not a public library API. */
export function createIsolatedWorker() {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  const calls = new Set<(error: Error) => void>();
  let failure: Error | undefined;
  let started!: () => void;
  let startupFailed!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    started = resolve;
    startupFailed = reject;
  });
  // A startup failure may precede the first fetch/observer.
  void ready.catch(() => {});
  const stop = (error: Error) => {
    failure ??= error;
    startupFailed(failure);
    for (const fail of calls) fail(failure);
    worker.terminate();
  };
  worker.onmessage = ({ data }) => {
    if (data.type === "ready") started();
  };
  worker.onerror = (event) => {
    event.preventDefault();
    stop(new Error(event.message || "Worker startup failed"));
  };
  worker.onmessageerror = () =>
    stop(new Error("Worker message could not be decoded"));

  const handler: WorkerHandler<{ UPSTREAM: string }> = {
    async fetch(request, env, ctx) {
      if (failure) throw failure;
      await ready;
      request.signal.throwIfAborted();
      const body = request.body ? await request.arrayBuffer() : null;
      request.signal.throwIfAborted();
      if (failure) throw failure;
      return new Promise<Response>((resolve, reject) => {
        const { port1, port2 } = new MessageChannel();
        let backgroundDone = false;
        let bodyDone = false;
        let released = false;
        let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
        let pulled: (() => void) | undefined;
        let cancelled:
          | { resolve(): void; reject(error: unknown): void }
          | undefined;
        let done!: () => void;
        ctx.waitUntil(
          new Promise<void>((resolve) => {
            done = resolve;
          }),
        );
        const send = (command: Command) => port1.postMessage(command);
        const release = () => {
          if (released || !bodyDone || !backgroundDone) return;
          released = true;
          request.signal.removeEventListener("abort", abort);
          port1.close();
          calls.delete(fail);
        };
        const finishBody = (...failure: [] | [unknown]) => {
          const [error] = failure;
          if (!bodyDone) {
            bodyDone = true;
            if (failure.length) stream?.error(error);
            else stream?.close();
          }
          pulled?.();
          pulled = undefined;
          if (failure.length) cancelled?.reject(error);
          else cancelled?.resolve();
          cancelled = undefined;
          release();
        };
        const fail = (error: Error) => {
          reject(error);
          backgroundDone = true;
          done();
          finishBody(error);
        };
        const abort = () => {
          send("abort");
          reject(request.signal.reason);
          finishBody(request.signal.reason);
        };
        calls.add(fail);
        request.signal.addEventListener("abort", abort, { once: true });
        port1.onmessageerror = () =>
          fail(new Error("Response message could not be decoded"));
        port1.onmessage = ({ data }: MessageEvent<Reply>) => {
          if (released) return;
          if (data.type === "response") {
            if (request.signal.aborted) {
              send("cancel");
              return;
            }
            const responseBody = data.hasBody
              ? new ReadableStream<Uint8Array>(
                  {
                    start(controller) {
                      stream = controller;
                    },
                    pull() {
                      return new Promise<void>((resolve) => {
                        pulled = resolve;
                        send("pull");
                      });
                    },
                    cancel() {
                      stream = undefined;
                      pulled?.();
                      pulled = undefined;
                      return new Promise<void>((resolve, reject) => {
                        cancelled = { resolve, reject };
                        send("cancel");
                      });
                    },
                  },
                  { highWaterMark: 0 },
                )
              : null;
            bodyDone = !data.hasBody;
            resolve(
              new Response(responseBody, {
                status: data.status,
                statusText: data.statusText,
                headers: data.headers,
              }),
            );
          } else if (data.type === "chunk") {
            if (!bodyDone) stream?.enqueue(data.value);
            pulled?.();
            pulled = undefined;
          } else if (data.type === "end") {
            finishBody();
          } else if (data.type === "error") {
            const error = new Error(data.message);
            error.name = data.name;
            reject(error);
            finishBody(error);
          } else {
            for (const error of data.errors)
              ctx.waitUntil(Promise.reject(new Error(error)));
            backgroundDone = true;
            done();
          }
          release();
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
          port2.close();
          fail(error as Error);
        }
      });
    },
  };
  return {
    handler,
    ready,
    get activeCalls() {
      return calls.size;
    },
    dispose() {
      stop(new Error("Experiment worker terminated"));
    },
  };
}
