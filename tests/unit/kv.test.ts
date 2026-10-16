import { expect, it, vi } from "vitest";
import { LocalStorageKV } from "../../src/features/kv/index";
import { openFeature } from "../../src/features/index";
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
it("preserves data across scopes and implementations without crossing namespaces", async () => {
  const backing = storage();
  const first = await openFeature(new LocalStorageKV('a":b', backing));
  await first.api.put("key", "日本語 🍷");
  await first.dispose();
  const next = await openFeature(new LocalStorageKV('a":b', backing));
  const other = await openFeature(new LocalStorageKV("a", backing));
  expect(await next.api.get("key")).toBe("日本語 🍷");
  expect(await other.api.get("b:key")).toBeNull();
  await other.api.put("key", "other");
  await next.api.delete("key");
  expect(await other.api.get("key")).toBe("other");
  await next.dispose();
  await other.dispose();
});
it("rejects unsupported options and values without modifying saved data", async () => {
  const api = new LocalStorageKV("test", storage()).create();
  await api.put("key", "original");
  // @ts-expect-error TTL is outside this profile, never silently ignored.
  await expect(api.put("key", "new", { expirationTtl: 60 })).rejects.toThrow(
    "without options",
  );
  // @ts-expect-error JSON reads are outside this profile.
  await expect(api.get("key", "json")).rejects.toThrow("without options");
  // @ts-expect-error Binary writes are outside this profile.
  await expect(api.put("key", new ArrayBuffer(1))).rejects.toThrow("string");
  expect(await api.get("key")).toBe("original");
});
it("enforces key byte limits and preserves prototype-like keys", async () => {
  const api = new LocalStorageKV("test", storage()).create();
  for (const key of ["", ".", "..", "é".repeat(257)]) {
    await expect(api.put(key, "value")).rejects.toThrow("KV key");
    await expect(api.get(key)).rejects.toThrow("KV key");
    await expect(api.delete(key)).rejects.toThrow("KV key");
  }
  for (const key of ["é".repeat(256), "__proto__", "constructor", "a/b"]) {
    await api.put(key, "value");
    expect(await api.get(key)).toBe("value");
  }
});
it("propagates storage quota and access failures as rejected operations", async () => {
  const error = new DOMException("full", "QuotaExceededError");
  const backing = storage();
  backing.setItem = vi.fn(() => {
    throw error;
  });
  const api = new LocalStorageKV("test", backing).create();
  await expect(api.put("key", "value")).rejects.toBe(error);
  backing.getItem = () => {
    throw error;
  };
  await expect(api.get("key")).rejects.toBe(error);
  backing.removeItem = () => {
    throw error;
  };
  await expect(api.delete("key")).rejects.toBe(error);
});
it("reports unavailable storage without silently using memory", async () => {
  vi.stubGlobal("localStorage", undefined);
  try {
    await expect(openFeature(new LocalStorageKV("test"))).rejects.toThrow(
      "unavailable",
    );
    expect(() => new LocalStorageKV("")).toThrow("namespace");
  } finally {
    vi.unstubAllGlobals();
  }
});
it("rejects oversized writes before changing storage", async () => {
  const backing = storage();
  const api = new LocalStorageKV("test", backing).create();
  await api.put("key", "original");
  await expect(
    api.put("key", "a".repeat(25 * 1024 * 1024 + 1)),
  ).rejects.toThrow("25 MiB");
  expect(await api.get("key")).toBe("original");
});

it("runs the reusable contract against implementations and detects lost writes", async () => {
  const { kvTextContract } = await import("../../src/testing/kv");
  const { runContract, assertContract } =
    await import("../../src/features/testing");
  class IsolatedKV extends LocalStorageKV {
    constructor() {
      super("contract");
    }
    override create() {
      return new LocalStorageKV("contract", storage()).create();
    }
  }
  const passing = await runContract(new IsolatedKV(), kvTextContract);
  assertContract(passing);
  expect(passing.cases.every((test) => test.status === "passed")).toBe(true);
  class LostWrites extends IsolatedKV {
    override create() {
      return { ...super.create(), put: async () => {} };
    }
  }
  const failing = await runContract(new LostWrites(), kvTextContract);
  expect(failing.cases.find((test) => test.id === "roundtrip")?.status).toBe(
    "failed",
  );
  expect(() => assertContract(failing)).toThrow();
});
