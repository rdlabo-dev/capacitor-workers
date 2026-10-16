import {
  kvTextFeature,
  type KVTextNamespace,
} from "@rdlabo/capacitor-workers/features/kv";
import { defineFeature } from "@rdlabo/capacitor-workers/features";
import { fetchFeature } from "@rdlabo/capacitor-workers/features/fetch";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
export const fetchContract: ContractSuite<typeof fetchFeature> = {
  feature: fetchFeature,
  cases: {
    async request(fetcher) {
      const response = await fetcher("https://worker.invalid/api/echo?q=1", {
        method: "POST",
        headers: { "x-test": "kept" },
        body: "日本語 🍷",
      });
      equal(await response.json(), {
        method: "POST",
        query: "1",
        header: "kept",
        body: "日本語 🍷",
      });
    },
    async response(fetcher) {
      const response = await fetcher("https://worker.invalid/api/status");
      equal(
        [
          response.status,
          response.headers.get("x-test"),
          await response.text(),
        ],
        [202, "kept", "accepted"],
      );
    },
    async missing(fetcher) {
      const response = await fetcher("https://worker.invalid/api/missing");
      equal([response.status, await response.text()], [404, "missing"]);
    },
    async head(fetcher) {
      const response = await fetcher("https://worker.invalid/api/status", {
        method: "HEAD",
      });
      equal(
        [
          response.status,
          response.headers.get("x-test"),
          await response.text(),
        ],
        [202, "kept", ""],
      );
    },
  },
};
export type TextStore = KVTextNamespace;
export const textFeature = kvTextFeature;
export const textContract: ContractSuite<typeof textFeature> = {
  feature: textFeature,
  cases: {
    async missing(api) {
      equal(await api.get("key"), null);
    },
    async roundtrip(api) {
      await api.put("key", "日本語 🍷");
      equal(await api.get("key"), "日本語 🍷");
    },
    async overwrite(api) {
      await api.put("key", "first");
      await api.put("key", "second");
      equal(await api.get("key"), "second");
    },
    async empty(api) {
      await api.put("key", "");
      equal(await api.get("key"), "");
    },
    async deleteMissing(api) {
      await api.delete("key");
      equal(await api.get("key"), null);
    },
    async delete(api) {
      await api.put("key", "value");
      await api.delete("key");
      equal(await api.get("key"), null);
    },
  },
};
export const wasmFeature = defineFeature<{
  validate(bytes: Uint8Array<ArrayBuffer>): boolean;
}>()("engine.wasm-validation", ["valid", "invalid"]);
export const wasmContract: ContractSuite<typeof wasmFeature> = {
  feature: wasmFeature,
  cases: {
    valid(api) {
      equal(api.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])), true);
    },
    invalid(api) {
      equal(api.validate(new Uint8Array([1, 2, 3])), false);
    },
  },
};
