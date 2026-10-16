# Local text KV

`LocalStorageKV` implements the `kv.text.v1` profile through the common feature host. It provides asynchronous, single-key `get(key)`, `put(key, string)` and `delete(key)` operations backed by WebView `localStorage`. A missing key returns `null`; an empty value remains an empty string. Data survives feature disposal, recreation and document reload. The application chooses a stable namespace; different namespaces have separate keys.

```ts
import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import { openFeature } from "@rdlabo/capacitor-workers/features";
import { LocalStorageKV } from "@rdlabo/capacitor-workers/features/kv";
import worker from "./worker";

const kv = await openFeature(new LocalStorageKV("my-app-settings"));
const runtime = capacitorWorkers({
  worker,
  baseURL: "https://example.com/api",
  env: { KV: kv.api },
});

// At application shutdown:
// runtime.dispose();
// await kv.dispose();
```

The Worker uses `env.KV` normally. Its binding type can be `KVTextNamespace` from the same subpath. This is deliberately a subset, not assignable to the full Cloudflare `KVNamespace` type. An actual Workers KV binding satisfies this subset. The example uses direct execution: function-bearing bindings cannot currently cross the isolated Worker structured-clone boundary. This change does not introduce an RPC transport or modify the common runner.

## Scope

- Supported: default text reads, string writes, overwrite, Unicode values, empty values, deletion including absent keys. Keys must be 1–512 UTF-8 bytes, excluding `.` and `..`; values cannot exceed 25 MiB, but browser quota may be much smaller.
- Not supported: read options (including explicit `"text"`), JSON/binary/stream modes, bulk reads, TTL/expiration, metadata, listing and cloud synchronization. Passing non-undefined options to these methods rejects instead of silently changing semantics. Unsupported methods are absent from the API and type.
- Storage quota/security errors propagate. Missing `localStorage` is reported as `FeatureUnavailable`; there is no silent in-memory fallback. An optional second constructor argument supplies an existing Web Storage-compatible backend, primarily for deterministic tests.
- Disposal releases no data and does not clear externally owned storage. Tests own their random namespaces and delete their own keys. Application data is removed only by `delete` or external storage clearing.
- Storage belongs to the WebView origin. Clearing application/browser data, uninstalling, storage eviction or changing the origin can lose access to it. No OS-level durability or encrypted-secret storage guarantee is made. Operations are synchronous Web Storage calls behind a Promise API; large values can block the UI.
- Local writes are immediately visible. Cloud replication, eventual consistency, regional caching and rate limits are not emulated. The six portable contract cases compare observable text behavior with local workerd, not production distributed behavior.

The contract is exported as `kvTextFeature`. `@rdlabo/capacitor-workers/testing/kv` exports `kvTextContract`, the reusable shared assertions; `PersistentText` and `WorkersText` provide isolated test state using the same `FeatureImplementation` / `runContract` standard. `demo/workers/features/kv.ts` is the same HTTP handler tested in a WebView and against a real local Workers KV binding. Browser tests additionally reload the document and verify namespace isolation and persistent deletion.

References: Cloudflare [reading KV](https://developers.cloudflare.com/kv/api/read-key-value-pairs/) and [writing KV](https://developers.cloudflare.com/kv/api/write-key-value-pairs/). Only the stated text subset is implemented.

Runtime guardrails remain in `LocalStorageKV`, independent of the contract suite: key/value validation, unsupported-option rejection and backend errors apply to ordinary application calls. Their regression tests live in `tests/unit/kv.test.ts`; they are not imposed on the actual Workers binding, which supports a wider API.
