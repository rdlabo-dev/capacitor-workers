import type { NativeCall } from "./native-network.js";

type Host = {
  socketWatch(callback: string, id: string): void;
  socketOpen(
    callback: string,
    id: string,
    host: string,
    port: number,
    tls: boolean,
  ): void;
  socketWrite(callback: string, id: string, chunk: string): void;
  socketEnd(callback: string, id: string): void;
  socketRead(callback: string, id: string, maxBytes: number): void;
  socketClose(callback: string, id: string): void;
  networkOpen(
    callback: string,
    id: string,
    url: string,
    method: string,
    headers: string,
    hasBody: boolean,
    encoding: string,
  ): void;
  networkWrite(callback: string, id: string, chunk: string): void;
  networkEnd(callback: string, id: string): void;
  networkRead(callback: string, id: string, maxBytes: number): void;
  networkClose(callback: string, id: string): void;
};
const calls = new WeakMap<Host, NativeCall>();
/** Android's hidden document host has a JavaScript interface, not Capacitor JS. */
export function getHostCall(): NativeCall | undefined {
  const target = globalThis as typeof globalThis & {
    CapacitorWorkersHost?: Host;
    CapacitorWorkersHostCallback?: {
      deliver(id: string, success: boolean, value: unknown): void;
    };
  };
  const host = target.CapacitorWorkersHost;
  if (!host?.networkOpen) return;
  const existing = calls.get(host);
  if (existing) return existing;
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: unknown): void }
  >();
  const callback = {
    deliver(id: string, success: boolean, value: unknown) {
      const operation = pending.get(id);
      if (!operation) return;
      pending.delete(id);
      if (success) operation.resolve(value);
      else
        operation.reject(
          new Error(
            String(
              (value as { message?: string })?.message ??
                "Native network failed",
            ),
          ),
        );
    },
  };
  if (target.CapacitorWorkersHostCallback)
    throw new Error("Native network callback is already installed");
  target.CapacitorWorkersHostCallback = callback;
  const call: NativeCall = (_plugin, method, args) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      pending.set(id, { resolve, reject });
      try {
        const handle = String(args.id);
        switch (method) {
          case "socketWatch":
            host.socketWatch(id, handle);
            break;
          case "socketOpen":
            host.socketOpen(
              id,
              handle,
              String(args.host),
              Number(args.port),
              args.tls === true,
            );
            break;
          case "socketWrite":
            host.socketWrite(id, handle, String(args.chunk));
            break;
          case "socketEnd":
            host.socketEnd(id, handle);
            break;
          case "socketRead":
            host.socketRead(id, handle, Number(args.maxBytes));
            break;
          case "socketClose":
            host.socketClose(id, handle);
            break;
          case "networkOpen":
            host.networkOpen(
              id,
              handle,
              String(args.url),
              String(args.method),
              JSON.stringify(args.headers),
              args.hasBody === true,
              String(args.encodeResponseBody ?? "automatic"),
            );
            break;
          case "networkWrite":
            host.networkWrite(id, handle, String(args.chunk));
            break;
          case "networkEnd":
            host.networkEnd(id, handle);
            break;
          case "networkRead":
            host.networkRead(id, handle, Number(args.maxBytes));
            break;
          case "networkClose":
            host.networkClose(id, handle);
            break;
        }
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  calls.set(host, call);
  return call;
}
