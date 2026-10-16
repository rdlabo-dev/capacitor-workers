import {
  defineFeature,
  FeatureImplementation,
  FeatureUnavailable,
} from "../index.js";

/** Single-key text subset of a Workers KV namespace. */
export interface KVTextNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
export const kvTextFeature = defineFeature<KVTextNamespace>()("kv.text.v1", [
  "missing",
  "roundtrip",
  "delete",
  "overwrite",
  "empty",
  "deleteMissing",
]);

/** Persistent, origin-local storage. Disposing a feature never deletes its data. */
export class LocalStorageKV extends FeatureImplementation<
  typeof kvTextFeature
> {
  constructor(
    private readonly namespace: string,
    private readonly storage?: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem"
    >,
  ) {
    super(kvTextFeature, {
      missing: { status: "supported" },
      roundtrip: { status: "supported" },
      delete: { status: "supported" },
      overwrite: { status: "supported" },
      empty: { status: "supported" },
      deleteMissing: { status: "supported" },
    });
    if (typeof namespace !== "string" || !namespace.length)
      throw new TypeError("KV namespace must be a nonempty string");
  }
  create(): KVTextNamespace {
    // Access can itself throw (for example a browser SecurityError). Preserve it.
    const storage = this.storage ?? globalThis.localStorage;
    if (!storage) throw new FeatureUnavailable("localStorage is unavailable");
    const prefix = `@rdlabo/capacitor-workers/kv/${JSON.stringify(this.namespace)}:`;
    const encoder = new TextEncoder();
    const keyOf = (key: string) => {
      if (
        typeof key !== "string" ||
        !key ||
        key === "." ||
        key === ".." ||
        encoder.encode(key).length > 512
      )
        throw new TypeError(
          "KV key must be 1–512 UTF-8 bytes and cannot be . or ..",
        );
      return prefix + key;
    };
    const noOptions = (args: unknown[]) => {
      if (args.some((value) => value !== undefined))
        throw new TypeError(
          "This KV profile supports only single-key text operations without options",
        );
    };
    return {
      async get(key: string, ...options: unknown[]) {
        noOptions(options);
        return storage.getItem(keyOf(key));
      },
      async put(key: string, value: string, ...options: unknown[]) {
        noOptions(options);
        const storedKey = keyOf(key);
        if (typeof value !== "string")
          throw new TypeError("KV value must be a string");
        if (encoder.encode(value).length > 25 * 1024 * 1024)
          throw new TypeError("KV value exceeds 25 MiB");
        storage.setItem(storedKey, value);
      },
      async delete(key: string, ...options: unknown[]) {
        noOptions(options);
        storage.removeItem(keyOf(key));
      },
    };
  }
}
