# Fetch adapter and runtime investigation

Investigated on 2026-10-16. This is a scoped compatibility investigation, not a claim of complete Workers compatibility.

## Hono reference

The [Service Worker guide](https://hono.dev/docs/getting-started/service-worker) uses a browser FetchEvent to dispatch to app.fetch. The browser supplies the execution environment. The installed Hono 4.13.13 adapter passes the Request and event context to app.fetch, with optional network fallback on 404. The current guide names @hono/service-worker; the source comparison here specifically used the installed hono/dist/adapter/service-worker/handler.js.

We retain the small dispatch boundary, without adding a Hono dependency. We intentionally do not copy 404 fallback: a local failure must not implicitly retry against a remote backend.

## workerd reference

Source revision: 40838ae3f72038c15ef9ed381f9d51880476ebb0.

| Responsibility | Reference | WebView implementation / gap |
| --- | --- | --- |
| Worker isolate and modules | [worker.c++](https://github.com/cloudflare/workerd/blob/40838ae3f72038c15ef9ed381f9d51880476ebb0/src/workerd/io/worker.c++) | Imported Worker shares globals with the UI; no isolate or module loader. |
| Request I/O ownership, outbound channels, background lifetime | [io-context.h](https://github.com/cloudflare/workerd/blob/40838ae3f72038c15ef9ed381f9d51880476ebb0/src/workerd/io/io-context.h) | Fresh context plus tracked promises; no per-request I/O isolation or resource limits. |
| waitUntil and exception passthrough | [global-scope.c++](https://github.com/cloudflare/workerd/blob/40838ae3f72038c15ef9ed381f9d51880476ebb0/src/workerd/api/global-scope.c++) | Promise tracking only; passthrough explicitly unsupported. |
| Fetch, redirects, body handling | [http.c++](https://github.com/cloudflare/workerd/blob/40838ae3f72038c15ef9ed381f9d51880476ebb0/src/workerd/api/http.c++) | Browser Request/Response plus URL mapping. Redirect following, cookie policies, and aborting response streams after headers remain gaps. |

workerd's [README](https://github.com/cloudflare/workerd/blob/40838ae3f72038c15ef9ed381f9d51880476ebb0/README.md) describes a native server runtime and lists Linux, macOS and Windows as tested platforms, not iOS/Android. “JavaScript/Wasm runtime” means it executes these programs, not that it ships a browser-compatible Wasm runtime. Mobile embedding would need a separate native port/build/bridge investigation. We did not build such a port or establish that it is impossible.

## Dispatch contract tightened in this change

- Relative URLs use document.baseURI, with location fallback when there is no document. Intercepted URLs retain path/query and map to the configured origin; credential-bearing URLs reject.
- Outside requests retain their original input and init. Local 404/500/errors never retry remotely.
- Aborting before the scheduled handler invocation prevents execution. Pending handler calls reject on abort; arbitrary application work cannot be forcibly stopped.
- HEAD drops and cancels a handler's returned body while retaining status/headers. Error responses and used/locked bodies reject.
- Tests cover env identity, per-invocation contexts, nested background tasks and delegation of untouched Request objects.

## Most important remaining runtime gap

UI and Worker code currently see the same patched global fetch. Worker subrequests inside the configured interception boundary re-enter the local handler and may recurse. Outside requests use WebView networking, including browser CORS/cookie behavior. This differs from workerd's outbound I/O channels.

Temporarily restoring global fetch while a handler runs would break concurrent UI requests and background work. A dedicated Web Worker is a candidate for separating globals, but needs a module entrypoint and Request/Response transport, including streams, aborts and errors. It is not a workerd isolate. Target WebView support and behavior must be measured before adopting it. This PR includes an isolated demo experiment, not a public runtime replacement.

## Dedicated Web Worker experiment

`demo/experiments/dedicated-worker/` imports the unchanged `demo/workers/runtime/isolation.ts` module in a separate global scope. The UI installs the existing adapter with a small MessageChannel bridge. Requests carry URL/method/headers and a buffered body; responses transfer a ReadableStream. Abort messages reach an AbortController inside the worker. Background completion is reported separately from the response and participates in runtime.drain().

The experimental page/build is separate from the normal demo and Capacitor assets. No extra dependency, native code or public library API was added.

Run from `demo/` after building the root library:

```sh
npm run test:workers
npm run test:experiment
```

| Observation | workerd | Chromium / WebKit dedicated worker |
| --- | --- | --- |
| Outbound fetch after await, alongside concurrent UI requests | Passed | Passed; upstream URL is inside the UI interception boundary, yet does not recurse |
| Logical request URL and no document global | Passed over local HTTP | Passed |
| waitUntil response independence and completion | Passed, with upstream response held until foreground completion | Passed; drain waits for released background requests |
| Incremental response body and client cancellation | Passed with identity encoding | Passed using transferred ReadableStream; source cancel callback observed |
| Abort while handler is pending | Not separately measured through HTTP | Passed; abort reaches source controller |
| Uncaught handler error | Not compared at HTTP boundary | Error name/message transported and caller rejects |
| Missing route | Local 404 | Local 404 |

Browser upstream responses are controlled with Playwright context routing; requests still originate from the Dedicated Worker fetch. workerd uses a temporary Node HTTP upstream only in the test process. Neither is a live Cloudflare deployment.

Two test-transport differences were observed: the harness exposes the HTTP scheme used by its local connection, and compressed open-ended streams did not produce the expected first chunk in the initial probe. The streaming comparison therefore explicitly requests identity encoding. Cancelling the workerd client reader succeeded, but the source JavaScript cancel counter did not increment during the observation window. We do not claim identical server teardown callbacks based on that result.

**Decision:** separate globals solve the tested inbound/outbound collision. Keep the experiment out of the library API until native WebViews and the transport lifecycle have been validated. This is evidence for a direction, not a finished replacement runtime.

**Prototype limits:** request bodies are fully buffered; only URL/method/headers/body are transported; env must be structured-cloneable, does not preserve object identity, and cannot carry functions; error identity/stack are not preserved; ports/listeners are retained until explicit experiment disposal; abort after response headers is not integrated with response-body reads. No CORS bypass, cookie isolation, compatibility-date emulation or isolate resource limits are supplied. Hono/Express continue to be tested through the existing adapter, not through this runtime prototype. iOS/Android native WebViews have not been tested for the prototype.

## Validation boundary

Root Vitest checks runtime behavior. Demo Vitest checks the real Hono/Workers Express entries in local workerd. Chromium/WebKit tests check both framework contracts offline plus browser FormData, base URI, HEAD and immediate cancellation using the built library. The separate experiment adds four tests in each browser. This does not establish full runtime compatibility; native simulator/device validation was not repeated for this change.
