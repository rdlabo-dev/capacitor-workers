# Workers Node.js compatibility inventory

## Implementation status

**`node:path`, `node:querystring`, and `node:string_decoder` are Complete at commit `b1a58d1`.** Their local contracts, native verification, manager/independent reviews and [remote CI](https://github.com/rdlabo-dev/capacitor-workers/actions/runs/38999137150) have passed. HTTP and runtime globals still have implementation work; uncommitted changes are not covered by this certification. See the [merge and release acceptance gate](../CONTRIBUTING.md#acceptance-gate).

The status column describes this repository. **Class A/B/C/D/U/S describes feasibility only.** Existing PoC implementations are completion work, not release-ready exceptions.

| Status              | Meaning                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Complete**        | The whole declared module/API unit satisfies the acceptance gate, including its export audit, contracts, integrations, native verification and reviews. |
| **In progress**     | Some behavior is implemented or verified, but completeness is not established. Not eligible for merge or release.                                       |
| **Unverified**      | A dependency polyfill or host API may provide behavior, but Workers parity has not been established. Not eligible for merge or release.                 |
| **Not implemented** | No implementation of the required behavior exists. A placeholder or empty export is not an implementation.                                              |
| **Out of scope**    | Not a local Node compatibility feature.                                                                                                                 |

| Module / feature                       | Current status                    | Implemented scope and remaining work                                                                                                                                            |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:path`                            | **Complete**                      | [Module contract](../src/compat/path/index.spec.ts): POSIX, win32, relative resolution and the actual Workers `matchesGlob` rejection. Accepted at `b1a58d1`; remote CI passed. |
| `node:querystring`                     | **Complete**                      | [Module contract](../src/compat/querystring/index.spec.ts), including all seven exports. Accepted at `b1a58d1`; remote CI passed.                                               |
| `node:string_decoder`                  | **Complete**                      | [Module contract](../src/compat/string-decoder/index.spec.ts), including constructor, prototype, encodings and public state. Accepted at `b1a58d1`; remote CI passed.           |
| HTTP server / Cloudflare Node bridge   | **In progress**                   | Public export/prototype audit, streaming server contracts and six real HTTP client contracts are implemented. Full-module acceptance review and CI remain pending.              |
| Node global injection                  | **In progress**                   | Pre-evaluation Node globals, owned Web globals and native outbound Fetch are implemented and locally exercised. Full API-unit acceptance and CI remain pending.                 |
| `node:async_hooks` / AsyncLocalStorage | **Not implemented**               | `AsyncResource = undefined` is a dependency fallback placeholder. Async context propagation is still under investigation, not declared impossible.                              |
| Other module families                  | **Unverified or Not implemented** | See each row below. Other module families are not certified Complete.                                                                                                           |

## Scope and evidence

Inventory date: 2026-10-17. Inventory starting point: `b58b543` (PR #16). The initial inventory used `2f10c95`; the first three module certifications now reference `b1a58d1`. Later candidate evidence below is explicitly distinguished from that accepted revision.
This inventory separates implementation feasibility from verified support. Only the bounded profiles in [First batch](#first-batch-implementation-evidence-and-remaining-work) have executable compatibility evidence.
It covers every category and non-functional stub in the [Workers Node.js overview](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), splitting mixed categories into API families below. It is not an exhaustive export/signature manifest of Node.js itself.

The target is Workers semantics, including its unsupported operations. A Node API implemented in native code by workerd does not necessarily require native code in Capacitor. Conversely, a browser polyfill being importable does not establish compatibility.

Sources describe current Workers behavior. For executable follow-up, use a fixed baseline: compatibility date `2026-10-17`, no extra flags, installed workerd `1.20261012.1` and Wrangler `4.151.0`. The first-batch contracts below run against this configuration. Older compatibility dates and explicit enable/disable flags require separate profiles. The overview currently enables Node compatibility by default for dates from `2026-08-04`; do not assume every profile needs an added `nodejs_compat` flag.

Classification is an engineering assessment from documented behavior and current code. Evidence for implemented profiles is recorded separately below. Unknown export details remain explicit follow-up items rather than being silently marked supported.

### Current completion work (not certified)

The development branch now includes owned Request/Response/Headers and
structured-clone adapters, native byte transports, Workers Fetch policy and Node
HTTP client/server behavior. The fixed-workerd comparison includes real loopback
HTTP rather than a Node-fetch proxy that would hide redirect/decompression
behavior. Node HTTP intentionally preserves the pinned Workers behavior, including
its joined Cookie header values and unsupported options.

Local checks currently include 214 unit tests, 42 Chromium/WebKit runtime tests,
256 runtime checks per native platform, and 80 native network checks per platform.
These are candidate results, not a substitute for full coverage and final CI.
The latest HTTP option/symbol changes passed the 256-check native suite; repeat
the network suite and packed-consumer gate on the final accepted revision.
The reproducible network procedure is in [the test guide](../demo/tests/README.md#native-outbound-http-contracts).

Remaining acceptance work includes the complete HTTP/Cloudflare bridge audit,
TLS trust/hostname failure coverage, final native package validation, transport
cost evidence, and the full runtime-global API-unit audit. No **In progress** row
is promoted solely because the currently written tests pass.

## Classification

| Code | Meaning                                   | Boundary                                                                                                                                                                         |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | JavaScript implementation                 | Module replacement using JS and existing Web APIs; no additional Capacitor plugin required.                                                                                      |
| B    | Global installation or wrapping           | JS implementation plus pre-evaluation injection, global adapters or lifecycle integration. Prefer scoped bindings over changing shared globals.                                  |
| C    | Native transport required                 | With no remote relay and no alternate JS engine, the required I/O is unavailable to normal WebView JavaScript. A Capacitor plugin must expose it.                                |
| D    | Unavailable under the stated architecture | Ordinary module/global replacement and asynchronous Capacitor calls cannot supply the required engine capability. This is not a claim of impossibility under every architecture. |
| U    | Unresolved                                | A concrete source audit or experiment is required. Do not equate unknown with impossible.                                                                                        |
| S    | Workers stub or unsupported operation     | Implement Workers' import/call behavior in JS. This is a target behavior, not a missing real OS implementation.                                                                  |

A/B/C can coexist within a module. S is an additional target-semantics label, normally implemented through A. Wasm is **not** included in the phrase “JS only”: any selected Wasm dependency needs an explicit decision, initialization plan and bundle cost. Network access and bundling are also stated separately.

## Inventory: computation and modules

The [official overview](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) establishes the module scope. A classifications below describe an implementation route, not an assertion that an existing polyfill already covers every overload or edge case.

| Implementation status | Category             | API family                                                                         | Class                      | Implementation boundary / remaining check                                                                                                                                                            |
| --------------------- | -------------------- | ---------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unverified            | Assertion testing    | `assert`, `assert/strict`, equality, throws/rejects                                | A                          | JS comparison and exception handling. Deep comparison involving engine-only inspection is U; test cross-realm values and error shapes.                                                               |
| Unverified            | Buffer               | `Buffer.from/alloc/concat`, encoding, reads/writes, views                          | A                          | Typed arrays and JS codecs; test shared backing memory and byte offsets.                                                                                                                             |
| **In progress**       | Buffer globals       | unqualified `Buffer`                                                               | B                          | Inject before application/dependency evaluation; imports and global must use the same implementation.                                                                                                |
| Unverified            | Events               | `EventEmitter`, `once`, `on`, listener bookkeeping                                 | A                          | Preserve ordering, error events, cancellation and iterator cleanup.                                                                                                                                  |
| Not implemented       | Events + context     | `EventEmitterAsyncResource` where exposed                                          | U                          | Depends on the async context decision; do not claim parity from EventEmitter alone.                                                                                                                  |
| **Complete**          | Path                 | POSIX and win32 operations, relative resolution and baseline matchesGlob rejection | A                          | Full module candidate verified locally; remote CI passed at `b1a58d1`. See the [contract](../src/compat/path/index.spec.ts).                                                                         |
| **Complete**          | Path                 | `win32`                                                                            | A                          | Implemented with the pinned Workers module, including the subpath export; accepted at `b1a58d1`; remote CI passed.                                                                                   |
| **Complete**          | Path                 | cwd-dependent `resolve`/`relative`                                                 | A                          | Matches the pinned Workers virtual root `/`; accepted at `b1a58d1`; remote CI passed.                                                                                                                |
| **Complete**          | Path                 | `matchesGlob`                                                                      | A/S                        | Reproduces the pinned Workers throwing behavior with a passing contract; remote CI passed at `b1a58d1`.                                                                                              |
| Unverified            | URL                  | `URL`, `URLSearchParams`, legacy parse/format/resolve, file URL conversion         | A                          | Standard APIs plus JS adaptation; Node-specific options need contract tests.                                                                                                                         |
| **Complete**          | Query strings        | parse/stringify/escape/unescape                                                    | A                          | All seven exports covered by the expanded module contract; remote CI passed at `b1a58d1`.                                                                                                            |
| Unverified            | Punycode             | encode/decode, domain conversion helpers                                           | A                          | JS algorithm; preserve deprecated-module availability for the selected profile.                                                                                                                      |
| **Complete**          | String decoder       | `StringDecoder` constructor and write/end/text                                     | A                          | Constructor, methods, encoding/state and reuse contracts verified locally; remote CI passed at `b1a58d1`.                                                                                            |
| **Complete**          | String decoder       | internal methods/state: `text`, `lastChar`, `lastNeed`, `lastTotal`                | A                          | Included in the expanded module contract; remote CI passed at `b1a58d1`.                                                                                                                             |
| Unverified            | Streams              | Readable/Writable/Duplex/Transform/PassThrough                                     | A                          | JS state machines; backpressure, destroy, error and event order.                                                                                                                                     |
| Unverified            | Stream helpers       | pipeline/finished, async iterators, promises, Web conversions                      | A                          | Web Streams and JS adaptation; abort and ownership must propagate.                                                                                                                                   |
| Unverified            | Utilities            | promisify/callbackify, format, MIME parsing, parseArgs where exposed               | A                          | Pure JS adapters; audit actual exports for the pinned profile.                                                                                                                                       |
| Unverified            | Utilities inspection | inspect, deep comparisons, `util.types`                                            | A/U                        | Ordinary formatting/type tests have JS routes; exact hidden-state inspection and cross-realm brands need per-method evaluation. Do not invent a successful result for an inaccessible internal slot. |
| Unverified            | Compression          | gzip/gunzip, deflate/inflate, raw variants, unzip                                  | A                          | JS codecs can provide synchronous and asynchronous facades. CompressionStream alone does not cover sync/options/flush semantics.                                                                     |
| Unverified            | Compression          | Brotli compress/decompress and stream forms                                        | A candidate / U dependency | Computation does not inherently need a plugin. Select and test JS implementation; a Wasm codec is a distinct option, not an already-proven JS solution.                                              |
| Unverified            | Compression          | Additional exports beyond documented codecs                                        | U                          | Extract from pinned workerd before promising newer Node codecs.                                                                                                                                      |
| Not implemented       | Test runner          | `mock`, MockTracker function/method/getter/setter tracking                         | A                          | Workers subset, not a complete CLI runner; inspect supported exports.                                                                                                                                |
| Not implemented       | Test runner          | Mock timers                                                                        | S                          | Documented as absent in Workers; match its failure behavior.                                                                                                                                         |
| Not implemented       | Module               | builtinModules, isBuiltin, getBuiltinModule-style registry                         | A + build                  | Generate one registry for Vite/esbuild and runtime lookup. Confirm which APIs live on `module` vs `process`.                                                                                         |
| Not implemented       | Module               | createRequire, resolution, dynamic module loading/hooks                            | U                          | Determine Workers' actual supported subset first. Statically bundled dependencies can use build-time resolution; arbitrary unbundled Node resolution must not be assumed.                            |

[util documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/util/) explicitly excludes several type-inspection methods (`isExternal`, `isProxy`, `isKeyObject`, and the documented WebAssembly compiled-module predicate). These belong to S for that documented profile, not to a project requirement to expose V8 internals. Resolve documentation/runtime differences against the fixed baseline.

[Zlib documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/zlib/) identifies the codec families; it does not establish that the repository's browser dependency implements all of them. [Test documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/test/) defines the MockTracker scope.

## Inventory: crypto

[Workers crypto documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) is the reference for supported algorithms and exceptions. Class A here means a computational route exists; a secure, complete implementation has not been selected or verified.

| Implementation status | API family                                                                            | Class                          | Boundary / acceptance decision                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unverified            | randomBytes, randomFill, randomUUID, randomInt                                        | A                              | Use platform cryptographic randomness, handle Web Crypto chunk limits and unbiased integer sampling. Never substitute Math.random.                                                                                         |
| Unverified            | Hash/Hmac, createHash/createHmac, update/digest                                       | A                              | JS incremental algorithms for sync APIs; Web Crypto where its asynchronous shape fits. Verify all supported algorithms.                                                                                                    |
| Unverified            | Cipher/Decipher, signing/verification, KDFs, key agreement                            | A candidate / U implementation | JS or explicit Wasm implementation for sync and streaming operations; algorithm, padding, encoding and failure behavior require vectors. Native acceleration is optional, not inherently necessary.                        |
| Unverified            | generateKey/generateKeyPair, sync variants, KeyObject, import/export, X509Certificate | A candidate / U implementation | Key generation and ASN.1/PEM/DER parsing can be computation; exact accepted forms, conversion and opaque-key interoperability require investigation. A Promise-returning plugin cannot directly replace a synchronous API. |
| Unverified            | webcrypto/subtle and CryptoKey integration                                            | A/U                            | Use existing Web Crypto where algorithms and key representations match. Browser algorithm gaps and non-extractable keys need individual decisions.                                                                         |
| Unverified            | timingSafeEqual and timing-sensitive guarantees                                       | U                              | Functional equality is easy; a constant-time guarantee in JS/JIT is not established. Do not relabel as supported after only output tests.                                                                                  |
| Unverified            | Documented unsupported algorithms / FIPS controls                                     | S                              | Preserve Workers restrictions; no device FIPS setting or additional OS service is required to reproduce rejection.                                                                                                         |

## Inventory: runtime and globals

| Implementation status | Category          | API family                                                        | Class                                                | Boundary / remaining check                                                                                                                                                                                                               |
| --------------------- | ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **In progress**       | Globals           | global alias, Buffer, process                                     | B                                                    | Prefer build injection or dedicated runtime globals. `window` is not present in a Dedicated Worker.                                                                                                                                      |
| **In progress**       | Globals           | fetch, Request/Response/Headers, encoding, abort, structuredClone | A/B/U                                                | Reuse platform objects where compatible; record Workers extensions, forbidden mutation and cross-realm behavior separately. Node inventory does not certify all Workers Web APIs.                                                        |
| Unverified            | Web Crypto        | crypto, SubtleCrypto                                              | A/U                                                  | See crypto table. Standard object availability is not algorithm parity.                                                                                                                                                                  |
| Unverified            | Web Streams       | Readable/Writable/TransformStream, readers, controllers           | A/U                                                  | Native Web APIs or JS polyfills; BYOB, transfer and host-brand interoperability need tests.                                                                                                                                              |
| Unverified            | Process           | env, platform/features/version-like values                        | A+B                                                  | Virtual runtime state, including value coercion and named-import identity. Build-machine env and server secrets must not be copied automatically.                                                                                        |
| Unverified            | Process           | nextTick                                                          | A+B                                                  | Workers uses queueMicrotask; preserve callback arguments and failure handling.                                                                                                                                                           |
| Unverified            | Process           | stdin/stdout/stderr                                               | A+B                                                  | Virtual streams and logging adapter, not OS file descriptors.                                                                                                                                                                            |
| Not implemented       | Process           | cwd/chdir                                                         | A                                                    | Shared virtual cwd; validate against the virtual FS.                                                                                                                                                                                     |
| Unverified            | Process           | hrtime, uptime and time-derived values                            | A/U                                                  | Implement documented compatibility behavior; native precision and matching timestamps are not the goal. Other process-v2 exports need baseline inspection.                                                                               |
| Unverified            | Process           | exit, abort, fatal errors / runtime termination                   | U; D for uninstrumented direct execution             | Throwing an exception is catchable and is not proof of termination semantics. Inspect Workers behavior. Worker-host termination may cover isolated mode; an ordinary plugin cannot stop arbitrary main-realm JS while preserving the UI. |
| Unverified            | Timers            | setTimeout/Interval/Immediate, clear variants, promises           | A+B                                                  | Host scheduling plus compatible handles/cancellation; confirm Workers ref/unref behavior and ordering. Background OS suspension is an execution limit, not fixed by a JS timer.                                                          |
| Unverified            | Console           | log/info/warn/error, format, Console streams, groups/timers       | A+B                                                  | Capture original sinks to prevent recursion; decide which methods require global installation.                                                                                                                                           |
| Unverified            | Errors            | classes, codes, causes, validation                                | A                                                    | JS construction and validation; don't rely on host-specific message text accidentally.                                                                                                                                                   |
| Unverified            | Errors            | captureStackTrace, structured stack formatting and exact stacks   | U                                                    | Browser engines differ. Exact V8 frames/internal hooks are D without engine support; determine whether required Workers exports actually expose them.                                                                                    |
| Unverified            | OS                | constants and Workers virtual values                              | A/U                                                  | Inspect the Workers subset. Device CPU/network/process information is not automatically the right value. No Device plugin dependency assumed.                                                                                            |
| Unverified            | Performance hooks | now, marks/measures, entry lists, observers                       | A/U                                                  | Web Performance plus JS where semantics permit; inspect the actual Workers subset and timer restrictions.                                                                                                                                |
| Unverified            | Performance hooks | GC/heap/event-loop internal observations                          | U → D if genuinely required                          | Ordinary plugin calls do not expose the WebView engine's internal observations. If Workers stubs these, classify S instead.                                                                                                              |
| Not implemented       | Debugger          | Workers Chrome DevTools integration                               | D for identical engine integration; separate tooling | Use platform debugging for local development. Protocol/tooling parity is not supplied by a runtime JS polyfill, especially on iOS JavaScriptCore.                                                                                        |

[Process documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/) describes virtual process behavior. [Timers documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/timers/) defines the scheduling surface. Claims about engine-internal obstacles are architectural assessments, not reported native test results.

## Inventory: async context and diagnostics

[AsyncLocalStorage documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/) requires context to survive asynchronous work. The current repository exports only an absent AsyncResource placeholder; none of the context guarantees below are implemented.

| Implementation status | API / behavior                                                                       | Class                                                   | Decision                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not implemented       | ALS run/getStore/exit within synchronous callbacks                                   | A                                                       | Stack-based scopes can cover this restricted case, but must not be advertised as complete ALS.                                                                                            |
| Not implemented       | ALS static bind/snapshot; AsyncResource bind/runInAsyncScope                         | A for explicit synchronous boundary / U for descendants | Capture/restore managed context. Async descendants require the next row.                                                                                                                  |
| Not implemented       | ALS across arbitrary native async/await, concurrent requests and unhandled rejection | D for global monkey-patching alone                      | Replacing Promise.then/timers does not expose every native await continuation. Normal Capacitor calls do not add an engine hook.                                                          |
| Not implemented       | ALS with whole-program async transformation or a supported host context primitive    | U                                                       | Prototype including dependencies, dynamic import, native promises, nesting, cancellation and unhandled rejection. This changes build/runtime assumptions and is not a completed solution. |
| Not implemented       | Remaining async_hooks exports                                                        | U/S                                                     | Extract Workers exports first; Node hook APIs must not be inferred from the ALS module name.                                                                                              |
| Not implemented       | diagnostics_channel channel/hasSubscribers/subscribe/unsubscribe/publish             | A                                                       | Per-runtime registry and synchronous ordered delivery.                                                                                                                                    |
| Not implemented       | diagnostics_channel bindStore/runStores/tracingChannel context propagation           | U                                                       | Depends on ALS result; ordinary event publication does not establish context parity.                                                                                                      |
| Out of scope          | Diagnostic forwarding to Tail Workers                                                | Outside local Node runtime scope                        | A cloud service integration, not recreated by the local channel implementation. No implicit cloud connection.                                                                             |

See [Diagnostics Channel](https://developers.cloudflare.com/workers/runtime-apis/nodejs/diagnostics-channel/) for the boundary between local channels and Tail Workers.

## Inventory: filesystem and network

| Implementation status | Category               | API family                                                                              | Class                                                | Boundary / remaining check                                                                                                                                                                                                       |
| --------------------- | ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not implemented       | FS                     | read/write/open/close, metadata, directories, links, sync/callback/promises, FileHandle | A candidate                                          | In-memory virtual FS; inspect Workers-supported operations and error codes, file descriptor lifetime and request isolation. No device Filesystem plugin inherently required.                                                     |
| Not implemented       | FS                     | `/bundle` files                                                                         | A + build                                            | Package read-only module bytes/metadata before startup. Lazy async loading cannot transparently satisfy an immediate sync read.                                                                                                  |
| Not implemented       | FS                     | `/tmp`, `/dev/null`, `/dev/zero`, `/dev/full`, `/dev/random`                            | A                                                    | Virtual devices and secure random source. Match Workers' lifetime and permission rules; do not introduce persistence.                                                                                                            |
| Not implemented       | FS                     | watch, permissions/ownership and other host-like operations                             | U/S                                                  | Establish which operations Workers implements, ignores or rejects. Never infer mobile filesystem behavior from API names.                                                                                                        |
| **In progress**       | HTTP receiving         | Server, IncomingMessage, ServerResponse, createServer, listen/close                     | A                                                    | Fetch-handler adaptation with an in-memory server registry. No network listener.                                                                                                                                                 |
| **In progress**       | Cloudflare Node bridge | httpServerHandler, handleAsNodeRequest                                                  | A                                                    | Adjacent required integration; preserve registry identity across bundles and dispatch context.                                                                                                                                   |
| Unverified            | HTTP/HTTPS sending     | request/get, ClientRequest, response stream, abort                                      | A over a transport                                   | Node-shaped JS facade. Browser fetch covers only permitted traffic.                                                                                                                                                              |
| Not implemented       | HTTP/HTTPS transport   | unrestricted cross-origin responses, controlled cookies/headers, redirects              | C for required behavior unavailable to WebView fetch | Native HTTP bridge for the affected operations. Audit Workers restrictions first; no need to implement options Workers itself rejects. Existing CapacitorHttp is a candidate, not verified coverage of streaming or all headers. |
| Not implemented       | DNS                    | resolve4/6 and other documented resolve variants, promises                              | A over DoH; C if browser transport blocks it         | Implement Workers' DNS-over-HTTPS route, subject to actual CORS/connectivity. No OS resolver is inherently necessary.                                                                                                            |
| Not implemented       | DNS                    | lookup, lookupService, generic resolve                                                  | S per current docs                                   | Preserve documented failure, rather than silently use a device resolver.                                                                                                                                                         |
| Unverified            | Net                    | isIP/isIPv4/isIPv6, BlockList, SocketAddress                                            | A                                                    | Address parsing and matching; confirm exact supported overloads.                                                                                                                                                                 |
| Not implemented       | Net                    | Socket/connect/createConnection, read/write/end/destroy                                 | C                                                    | Raw outbound TCP. Needs native socket lifecycle, flow control, cancellation and error mapping.                                                                                                                                   |
| Unverified            | Net                    | Server/listen for actual TCP listeners                                                  | S                                                    | Workers does not support net.Server. No native listener needed.                                                                                                                                                                  |
| Not implemented       | TLS                    | connect, TLSSocket connection and I/O                                                   | C                                                    | TLS socket transport, validation and relevant connection metadata. Audit supported options before choosing native SDK APIs.                                                                                                      |
| Unverified            | TLS                    | checkServerIdentity, certificate/context representation                                 | A candidate / U detail                               | Parsing/name checks can be JS. createSecureContext material consumed by native TLS may require C; callback shape alone does not decide.                                                                                          |
| Unverified            | TLS                    | server creation and other documented absent APIs                                        | S                                                    | Match Workers rejection.                                                                                                                                                                                                         |

Sources: [FS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/), [HTTP](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/), [HTTPS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/https/), [DNS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/), [Net](https://developers.cloudflare.com/workers/runtime-apis/nodejs/net/), [TLS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/tls/).

A native transport must also work when the handler executes in a Dedicated Worker: relay through the host with a narrowly defined MessagePort protocol if the Capacitor bridge is unavailable there. Do not pass plugin objects as cloned env bindings. Socket IDs, listener cleanup, backpressure, permission errors and runtime disposal belong to the transport contract. Neither iOS nor Android implementation is presumed complete.

## All documented non-functional stub modules

The [official stub inventory](https://developers.cloudflare.com/workers/runtime-apis/nodejs/#non-functional-stub-modules) contains these 16 modules. Each has a planned route of **S through A** for the applicable compatibility profile; this is not an implementation status. None has a verified stub-parity contract in this repository. Import availability, export shape, no-op vs throwing behavior and errors need per-export baseline tests; a blanket empty object is not enough.

| Implementation status | Modules          | What is not required for Workers parity                                   |
| --------------------- | ---------------- | ------------------------------------------------------------------------- |
| Unverified            | `http2`          | An HTTP/2 server/client stack                                             |
| Unverified            | `vm`             | New JS execution contexts                                                 |
| Unverified            | `cluster`        | Multiple OS processes                                                     |
| Unverified            | `domain`         | A full legacy Node domain runtime                                         |
| Unverified            | `trace_events`   | Native tracing infrastructure                                             |
| Unverified            | `wasi`           | A WASI host                                                               |
| Unverified            | `_stream_wrap`   | Node internal stream handles                                              |
| Unverified            | `dgram`          | UDP sockets                                                               |
| Unverified            | `inspector`      | V8 inspector integration                                                  |
| Unverified            | `sqlite`         | SQLite database/plugin                                                    |
| Unverified            | `child_process`  | Process spawning                                                          |
| Unverified            | `readline`       | Terminal input handling                                                   |
| Unverified            | `repl`           | Interactive Node shell                                                    |
| Unverified            | `tty`            | Native terminal descriptors                                               |
| Unverified            | `v8`             | V8 heap/runtime access                                                    |
| Unverified            | `worker_threads` | Node threads; a Web Worker is not evidence of this module's compatibility |

Dates/flags govern whether these are importable. Do not broaden a stub into a functioning API merely because the device could implement it. Separate binding features such as D1 or KV remain outside this inventory.

## Existing implementation vs planned feasibility

Each compatibility module owns a directory under `src/compat/<module>/`, with `index.ts` as its entry point. Subpaths and dependency declarations stay inside that directory (for example, `path/posix/index.ts` and `path/win32/index.ts`). Each module keeps its tests, including contract definitions and coverage, in the adjacent `index.spec.ts`; environment runners in `demo/tests/` execute those same contracts. Test code is excluded from the production compilation. TypeScript preserves the implementation structure in `dist/compat/`; the shared build aliases resolve to the compiled entry points.

| Current code                                                      | Actual evidence / gap                                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/vite.ts`, `src/esbuild.ts`                                   | Broad browser polyfills and shared overrides. General Node compatibility is not certified. esbuild maps unavailable modules to an empty object, which is not proof of Workers stub parity. |
| `src/build/shared.ts`                                             | Shared aliases for http, async_hooks, path, querystring, string_decoder and Cloudflare helpers. Extend this existing boundary; avoid separate Vite/esbuild truth sources.                  |
| `src/compat/http/index.ts`, `src/compat/cloudflare-node/index.ts` | Streaming Express server adaptation with cancellation and backpressure. Full HTTP client/server/header surface remains incomplete.                                                         |
| `src/compat/async-hooks/index.ts`                                 | AsyncResource is undefined; ALS is not implemented.                                                                                                                                        |
| `src/compat/globals/index.ts`                                     | Buffer/process injection exists; no complete runtime-global contract.                                                                                                                      |
| `src/features/index.ts`, `testing.ts`                             | Existing typed definitions, implementation coverage and lifecycle test harness are reusable. A new abstract framework is unnecessary.                                                      |
| Native document plugin                                            | Provides document rendering, not a general Node TCP/TLS/HTTP transport.                                                                                                                    |

## First batch: implementation evidence and remaining work

The three module implementations have no declared exclusions and are **Complete
at `b1a58d1`**. Manager and independent acceptance reviews have no outstanding
code findings, and [all remote CI jobs passed](https://github.com/rdlabo-dev/capacitor-workers/actions/runs/38999137150).
Do not interpret the receiving-side HTTP tests as completion of `node:http`.

Baseline: workerd **1.20261012.1**, compatibility date **2026-10-17**, no additional
compatibility flags. The contract is shared by workerd and both local execution
modes, rather than maintaining separate expected outputs for the browser.

| Unit                                                   | Implemented and tested                                                                                                                                                                                                      | Contract groups |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `node:path`, `path`, and both `posix`/`win32` subpaths | All exported operations, POSIX and Windows paths, UNC/namespaces, relative resolution, invalid arguments and export identity. `matchesGlob` reproduces the baseline's actual rejection.                                     | 14              |
| `node:querystring`, `querystring`                      | All seven exports, separators, duplicate keys, limits, malformed escapes, null-prototype results, custom codecs, URI errors and BOM preservation.                                                                           | 11              |
| `node:string_decoder`, `string_decoder`                | Constructor, `write`/`end`/`text`, all baseline encodings, `lastChar`/`lastNeed`/`lastTotal`, partial and invalid input, BOM, input windows, invalid receivers and reuse after `end`.                                       | 15              |
| HTTP / Cloudflare Node bridge (incomplete)             | Server/port descriptors, lifecycle, streaming, asynchronous errors, dispatch context, client request/get/validation/destroy/timeout, headers and baseline stubs. Client network cases currently use a shared fetch fixture. | 18              |

Path and querystring adapt the pinned workerd source. StringDecoder uses a local
UTF-8 state machine plus adapters around the npm `string_decoder` implementation
for other encodings. Each module carries its upstream notices and Apache license;
the build copies these into the npm tarball and the packed-consumer test checks
their presence.

Local verification during the completion work (not whole-unit certification):

- Root unit tests: 184 passed; type checking passes.
- Pinned workerd: 58 shared Node groups; separate Headers/Request/Response contracts
  each contain 8 groups, structuredClone 11, and Immediate 4.
- Chromium and WebKit, direct and Dedicated Worker: 42 runtime tests and 20
  development-startup tests passed. The five candidate Web API contracts also pass
  both browsers and execution modes, including the structuredClone review regressions.
- Vite/esbuild: 7 build unit tests and 30 integration tests passed.
- Packed consumer: 26 direct, 22 isolated and 144 common feature cases passed;
  Vite/esbuild/raw ESM 10 cases and configured Vite development 2 cases passed.
  Candidate internal APIs resolve from the installed tarball, not checkout sources.
- iOS 26.1 and Android 16: each passed 256 runtime checks, with no exclusions,
  including 116 Node groups across direct and Dedicated Worker execution. This run
  includes the structuredClone review regressions and is built alongside the
  native candidate plugin. It does not exercise the new outbound transport or
  certify the missing whole-runtime network ownership.
  Generated evidence is under
  `demo/artifacts/node-light/`.
- These HTTP client contracts do not establish native network compatibility.
  Separate real loopback probes found URLSession loses duplicate cookies/raw gzip
  and fails abort/early-response cases; OkHttp passes six of seven probes but waits
  for upload EOF on HTTP/1. Both candidates remain incomplete.
- An isolated AsyncHTTPClient 1.36.2 proof preserves duplicate cookies, raw gzip and
  response headers before upload EOF on macOS and iOS 26.1. This is not yet a
  completed transport. The current uncommitted iOS candidate now uses it behind
  the existing NativeConnection byte contract; its seven real-network probes pass,
  but whole-runtime ownership and release acceptance remain. A follow-up
  iOS probe also rejects a pending body read on cancellation and rejects an untrusted
  local TLS certificate. Full hostname/positive TLS and upload/header-wait cancellation
  tests remain.
- An Android 16 Netty 4.1.139.Final proof preserves the same three HTTP properties
  and builds with minSdk 24. Netty 4.2.19.Final fails dexing at minSdk 24; 4.1 also
  needs application packaging rules for duplicate JAR metadata. Neither version is
  adopted as a product dependency. Build/setup cost and lifecycle acceptance remain.
- Remote CI at `b1a58d1` passed library, compatibility, packed consumer, upstream
  and the final CI gate. Earlier failures exposed clean-checkout type resolution
  and an unnecessary Service Worker reload; both have regression fixes.
  This certifies the three unchanged first-batch modules, not uncommitted HTTP,
  globals or native-transport candidates.

Reproduce from the repository root (after installing root and demo dependencies):

```sh
npm run build
npm run test:workers --prefix demo -- tests/workers/node-compat.test.ts
npm run test:runtime --prefix demo
npm run test:runtime:dev --prefix demo
npm run test:build-tools --prefix demo
npm run test:package
npm run test:native:prepare --prefix demo -- runtime
npm run sync --prefix demo
npm run ios --prefix demo       # or: npm run android --prefix demo
```

Workers path resolution uses `/`, even though `process.cwd()` reports `/bundle`.
This behavior comes from the pinned path implementation; it does not depend on
implementing a virtual process. Workers' own `matchesGlob` failure is a passing
contract expectation, never a skipped or unsupported local case.

## Outstanding completion debt

The following units still require implementation; passing the first batch does
not certify them or the entire package.

- **HTTP and Cloudflare Node bridge:** complete the baseline export and prototype
  surface, including clients, Agents, request/get, socket/connection helpers,
  server options and remaining header/trailer behavior. The receiving adapter's
  streaming and cleanup improvements are only part of this unit. Resolve its
  synthesized Host/Transfer-Encoding/socket metadata against actual Workers
  transport behavior. Unrestricted outbound traffic needs native transport.
- **Node global injection:** unqualified injected identifiers are not enough.
  Pre-evaluation installation, dynamic imports, import/global identity, collision
  checks and scoped cleanup now have regression coverage. The Worker bootstrap
  also avoids WebKit evaluating an entry twice through a dynamic-import cycle.
  Final acceptance and the complete runtime-global surface remain outstanding.
- **Web runtime globals:** audit each named API, Workers-specific extensions,
  cloning/body ownership and cancellation. Browser fetch retains CORS and forbidden
  header restrictions; an asynchronous native transport and its streaming/abort
  contract are required for those operations. The existing document plugin and
  buffered Capacitor HTTP calls do not establish that compatibility. Native
  connections must be owned by a runtime and released when that runtime stops;
  old callbacks must never reach a replacement WebView.

## Decisions required before implementation

| Investigation            | Output required to close U                                                                                                                               | Consequence                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Pinned export audit      | Export and selected prototype-method manifest, including subpaths, flags, stubs, module/process/os/perf APIs; source references where docs omit behavior | Refines the inventory without inheriting all Node APIs by accident. Importability alone never closes compatibility. |
| Async context            | Concurrent/nested await tests with native promises, timers, exceptions, dynamic imports and unhandled rejection on iOS/Android                           | Choose supported engine primitive or whole-program transform; otherwise explicitly retain the architecture gap.     |
| Crypto                   | Algorithm/key-format matrix, published vectors, synchronous API tests, non-extractable keys and timing guarantees assessment                             | Choose JS/Web Crypto, explicit Wasm or required native assistance per API.                                          |
| Transport                | CORS/headers/cookies/redirect/stream tests plus TCP/TLS cancellation and validation in both native platforms                                             | Define the minimal native plugin contract; retain plain-browser limitations.                                        |
| Engine-dependent exports | Verify which are real Workers APIs, then distinguish observable semantics from implementation details                                                    | Avoid implementing V8 internals for a Workers stub; identify genuine D cases.                                       |
| Polyfill audit           | Run the same cases in workerd and each adapter; record exports that are missing or behave differently                                                    | Reuse tested dependencies and replace only proven gaps.                                                             |

The inventory stage is complete when every overview category and stub has a route or an explicit unresolved question, as above. **Full implementation completion is a different gate**: export-level coverage, behavior contracts, build-tool integration and native evidence are still required. No A/B/C/U row should be advertised as supported from this document alone.

For implementation, preserve one contract suite across workerd, direct execution and Dedicated Worker execution; validate Vite and esbuild resolution plus packed-consumer behavior. Globals must be ready before module evaluation. Scope state to the runtime, restore owned patches on disposal and avoid overwriting unrelated application globals. A `window` replacement is neither necessary nor sufficient.
