import { kvTextFeature } from "../features/kv/index.js";
import type { ContractSuite } from "../features/testing.js";
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
/** Requires an isolated, initially empty test namespace per case; writes key "key". */
export const kvTextContract: ContractSuite<typeof kvTextFeature> = {
  feature: kvTextFeature,
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
