import {
  FeatureImplementation,
  FeatureUnavailable,
  type FeatureScope,
} from "@rdlabo/capacitor-workers/features";
import { textFeature, wasmFeature, type TextStore } from "./contracts";

/** Test-only memory provider: no persistence or full KV compatibility claim. */
export class MemoryText extends FeatureImplementation<typeof textFeature> {
  constructor() {
    super(textFeature, {
      missing: { status: "supported" },
      roundtrip: { status: "supported" },
      delete: { status: "supported" },
    });
  }
  create(scope: FeatureScope): TextStore {
    const data = new Map<string, string>();
    scope.defer(() => data.clear());
    return {
      get: async (key) => data.get(key) ?? null,
      put: async (key, value) => {
        data.set(key, value);
      },
      delete: async (key) => {
        data.delete(key);
      },
    };
  }
}

/** Wrap an actual workerd KV binding with an isolated namespace for each case. */
export class WorkersText extends FeatureImplementation<typeof textFeature> {
  constructor(private readonly kv: TextStore) {
    super(textFeature, {
      missing: { status: "supported" },
      roundtrip: { status: "supported" },
      delete: { status: "supported" },
    });
  }
  create(scope: FeatureScope): TextStore {
    const prefix = `${crypto.randomUUID()}:`;
    const keys = new Set<string>();
    scope.defer(async () => {
      await Promise.all([...keys].map((key) => this.kv.delete(prefix + key)));
    });
    return {
      get: (key) => this.kv.get(prefix + key),
      put: (key, value) => {
        keys.add(key);
        return this.kv.put(prefix + key, value);
      },
      delete: (key) => this.kv.delete(prefix + key),
    };
  }
}

export class WasmValidation extends FeatureImplementation<typeof wasmFeature> {
  constructor() {
    super(wasmFeature, {
      valid: { status: "supported" },
      invalid: { status: "supported" },
    });
  }
  create() {
    if (
      typeof WebAssembly === "undefined" ||
      typeof WebAssembly.validate !== "function"
    )
      throw new FeatureUnavailable("WebAssembly.validate is unavailable");
    return {
      validate: (bytes: Uint8Array<ArrayBuffer>) => WebAssembly.validate(bytes),
    };
  }
}
