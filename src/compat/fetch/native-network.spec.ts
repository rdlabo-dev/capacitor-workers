import { describe, expect, it, vi } from "vitest";
import { createNativeNetwork, type NativeCall } from "./native-network.js";

type MockCall = {
  plugin: string;
  method: string;
  args: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function base64Of(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function createMockNativeCall(): {
  call: NativeCall;
  calls: MockCall[];
  release: () => void;
} {
  const calls: MockCall[] = [];
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();
  let counter = 0;
  const call: NativeCall = (
    plugin: string,
    method: string,
    args: Record<string, unknown>,
  ) => {
    const id = `${method}-${counter++}`;
    const { promise, resolve, reject } = deferred<unknown>();
    pending.set(id, { resolve, reject });
    calls.push({ plugin, method, args, resolve, reject });
    return promise;
  };
  const release = () => {
    for (const { reject } of pending.values()) {
      reject(new Error("Native bridge released"));
    }
    pending.clear();
  };
  return { call, calls, release };
}

describe("createNativeNetwork", () => {
  it("rejects unsupported URL schemes", async () => {
    const network = createNativeNetwork({ nativeCall: vi.fn() });
    await expect(
      network.open({
        url: "ftp://example.invalid",
        method: "GET",
        headers: [],
        hasBody: false,
      }),
    ).rejects.toThrow("only supports HTTP(S)");
  });

  it("rejects malformed methods and headers", async () => {
    const network = createNativeNetwork({ nativeCall: vi.fn() });
    await expect(
      network.open({
        url: "https://example.invalid",
        method: "GET\r\nInjected: 1",
        headers: [],
        hasBody: false,
      }),
    ).rejects.toThrow("line breaks");
    await expect(
      network.open({
        url: "https://example.invalid",
        method: "GET",
        headers: [["Host", "example\r\nInjected: 1"]],
        hasBody: false,
      }),
    ).rejects.toThrow("line breaks");
  });

  it("returns a connection whose headers resolve independently of the body", async () => {
    const { call, calls } = createMockNativeCall();
    const network = createNativeNetwork({ nativeCall: call });
    const connection = await network.open({
      url: "https://example.invalid",
      method: "POST",
      headers: [["Content-Type", "application/octet-stream"]],
      hasBody: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      plugin: "CapacitorWorkers",
      method: "networkOpen",
      args: {
        url: "https://example.invalid",
        method: "POST",
        headers: [["Content-Type", "application/octet-stream"]],
        hasBody: true,
      },
    });
    expect(typeof calls[0]!.args.id).toBe("string");

    const headers = connection.headers;
    const settle = vi.fn();
    void headers.then(settle);
    expect(settle).not.toHaveBeenCalled();

    calls[0]!.resolve({
      status: 200,
      statusText: "OK",
      headers: [
        ["set-cookie", "a=1"],
        ["set-cookie", "b=2"],
      ],
      hasBody: true,
    });

    const result = await headers;
    expect(result.status).toBe(200);
    expect(result.headers).toEqual([
      ["set-cookie", "a=1"],
      ["set-cookie", "b=2"],
    ]);
  });

  it("encodes write chunks and decodes read chunks", async () => {
    const { call, calls } = createMockNativeCall();
    const network = createNativeNetwork({ nativeCall: call, chunkSize: 16 });
    const connection = await network.open({
      url: "https://example.invalid",
      method: "POST",
      headers: [],
      hasBody: true,
    });

    const writePromise = connection.write(new Uint8Array([1, 2, 3, 4]));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({
      plugin: "CapacitorWorkers",
      method: "networkWrite",
      args: { chunk: base64Of([1, 2, 3, 4]) },
    });

    calls[1]!.resolve(undefined);
    await writePromise;

    const readPromise = connection.read();
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]).toMatchObject({
      plugin: "CapacitorWorkers",
      method: "networkRead",
      args: { maxBytes: 16 },
    });
    calls[2]!.resolve({ chunk: base64Of([5, 6]) });
    const chunk = await readPromise;
    expect([...(chunk as Uint8Array)]).toEqual([5, 6]);

    const eofPromise = connection.read();
    await vi.waitFor(() => expect(calls).toHaveLength(4));
    calls[3]!.resolve({ eof: true });
    expect(await eofPromise).toBe(null);
  });

  it("awaits one native close and propagates cleanup failure", async () => {
    const { call, calls } = createMockNativeCall();
    const network = createNativeNetwork({ nativeCall: call });
    const connection = await network.open({
      url: "https://example.invalid",
      method: "GET",
      headers: [],
      hasBody: false,
    });
    const closePromise = connection.close();
    await vi.waitFor(() =>
      expect(calls.some((c) => c.method === "networkClose")).toBe(true),
    );
    const repeated = connection.close();
    expect(repeated).toBe(closePromise);
    await Promise.resolve();
    calls.find((c) => c.method === "networkClose")!.reject(new Error("closed"));
    await expect(closePromise).rejects.toThrow("closed");
    await expect(repeated).rejects.toThrow("closed");
    await expect(connection.headers).rejects.toThrow("connection is closed");
    const closeCalls = calls.filter((c) => c.method === "networkClose");
    expect(closeCalls).toHaveLength(1);
  });

  it("forwards encodeResponseBody to the native open call", async () => {
    const { call, calls } = createMockNativeCall();
    const network = createNativeNetwork({ nativeCall: call });
    const request = {
      url: "https://example.invalid",
      method: "GET",
      headers: [],
      hasBody: false,
      encodeResponseBody: "manual" as const,
    };
    await network.open(request);
    expect(calls[0]!.args.encodeResponseBody).toBe("manual");
  });

  it("rejects invalid native responses", async () => {
    const { call, calls } = createMockNativeCall();
    const network = createNativeNetwork({ nativeCall: call });
    const connection = await network.open({
      url: "https://example.invalid",
      method: "GET",
      headers: [],
      hasBody: false,
    });
    calls[0]!.resolve({ status: "bad", headers: [] });
    await expect(connection.headers).rejects.toThrow("Invalid headers");
  });

  it("rejects the default bridge when Capacitor is absent", () => {
    const original = (globalThis as typeof globalThis & { Capacitor?: unknown })
      .Capacitor;
    (globalThis as typeof globalThis & { Capacitor?: unknown }).Capacitor =
      undefined;
    try {
      expect(() => createNativeNetwork()).toThrow("Capacitor native bridge");
    } finally {
      (globalThis as typeof globalThis & { Capacitor?: unknown }).Capacitor =
        original;
    }
  });
});
