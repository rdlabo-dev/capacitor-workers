# PoC verification — 2026-10-16

Implemented on branch `poc/workers-webview`. No cloud deployment or npm publication was performed.

## Results

| Environment                       | Result                           | Evidence                                                  |
| --------------------------------- | -------------------------------- | --------------------------------------------------------- |
| TypeScript                        | Passed                           | `npm run typecheck`                                       |
| Runtime unit tests                | 7/7                              | `npm test`                                                |
| Chromium                          | 26/26 + 18/18 offline API checks | `npm run test:browser`                                    |
| WebKit                            | 26/26 + 18/18 offline API checks | `npm run test:browser`                                    |
| Local Cloudflare workerd          | Hono 9/9; Express 9/9            | `artifacts/workerd-results.json`                          |
| Fresh npm-tarball consumer        | 26/26                            | `artifacts/package-results.json`                          |
| iOS 26.1 Simulator, iPhone 17 Pro | 26/26                            | `artifacts/ios.png`, visually inspected                   |
| Android 16 emulator               | 26/26                            | `artifacts/android.png`, `artifacts/android-results.json` |

Native builds use Capacitor 8.5.3 and bundled assets, without `server.url`. Both platform screenshots show the actual platform and every successful check. Native physical devices and cloud-hosted Workers were not tested. Local workerd is sufficient for this first API compatibility check; any later live deployment should use the requested `rdlabo-dev` account.

The same `demo/workers/hono/standard.ts` and `demo/workers/express/standard.ts` files run in workerd and the WebView. Express is 5.3.0; Hono is 4.13.13. The common API contract covers GET/query, POST/Unicode JSON/status, nested routing, middleware headers, 404, error middleware, 204, HEAD and concurrent calls. WebView checks add Request input, URL mapping, env, waitUntil success/failure and original-fetch passthrough.

`baseURL` points at `https://worker.invalid/api/` in the native demo. No API server can satisfy that URL. Browser tests observe zero network requests to the API and repeat the API contract with networking disabled.

## Findings

- Express needs more than a fetch wrapper. Its Workers `cloudflare:node` bridge and Node HTTP objects need a browser build adapter. The PoC implements only the required in-memory server/request/response surface.
- Correct socket lifecycle flags are necessary for `express.json()` to read bodies. Express's 404 path also needs `setImmediate`. Both failures were found by the integration tests and fixed.
- iOS custom-scheme URLs need protocol/host comparison. Comparing only `URL.origin` would mishandle opaque origins; a unit test covers this case.
- Combined minified demo JavaScript: approximately **1,481 kB**, **489 kB gzip**. This includes both frameworks, broad Node polyfills and the test UI. It is not the standalone core size, nor an optimized release. Narrowing Express dependencies is future work.
- The build reports an `eval` warning from transitive `vm-browserify`. Strict-CSP compatibility has not been established.
- After updating the test runner, npm audit reports **0 high/critical**, **3 moderate and 6 low** dependency findings. Remaining chains involve Capacitor CLI's `xcode`/`uuid` and the browser crypto polyfills. This PoC is not release-hardened; do not use the experimental compatibility layer as a cryptographic compatibility guarantee.
- D1, KV, R2 and automatic Wrangler binding setup are intentionally unimplemented. Express streaming, arbitrary middleware/Node APIs, cloud secrets and cloud data synchronization are outside the tested contract.

Screenshots, build products and raw results are local ignored artifacts. The reproduction scripts and generated native project sources are retained in the repository.

## Adversarial review follow-up

The review found that a double-slash pathname could override the configured Worker origin. URL construction now assigns pathname and query separately. A second failure reproduced an uncaught exception and pending fetch when asynchronous Express response headers could not be converted; header conversion is now inside the existing rejection boundary.

Both cases have regression tests. Build, typecheck, seven unit tests, Chromium and WebKit (26 checks plus 18 offline API checks each) pass after these fixes. The native screenshots above are from the initial PoC run; native builds were not repeated for these two targeted fixes.

## Demo project layout

The validation app now lives entirely under `demo/`, with independent dependencies and a lockfile (no npm workspace). Run browser/workerd tests and Capacitor commands from that directory. The library build, unit tests and npm tarball consumer test remain at the repository root. Historical artifact paths above refer to their original runs.

The boundary review copied the library into a temporary directory without demo or native projects: clean install, build, typecheck and all seven unit tests passed. The independent demo then passed its own clean install, typecheck and build. Chromium/WebKit, local workerd and the fresh tarball consumer tests also passed after the separation. Capacitor sync regenerated Android's dependency path against `demo/node_modules`, not the root installation. The combined demo now measures approximately 1,533 kB minified (about 505–507 kB gzip), distinct from the initial measurements above.

## Workers test runner and CLI migration

The handwritten workerd runner has been replaced by Vitest 5.0.5 in the independent demo package. `npm run test:workers` reports 18 individual passing tests (nine each for Hono and Express), and demo typechecking passes. Wrangler's official `createTestHarness` manages runtime startup and cleanup without fixed ports or custom readiness polling. This run does not generate the historical `workerd-results.json`; use Vitest's reporters when machine-readable results are needed.

Cloudflare CLI `cf` 1.0.0-beta.17 uses `demo/cloudflare.config.ts`, selecting Hono or Express with `--mode`. Both `cf build --mode hono` and `cf build --mode express` pass. The previous Wrangler JSON configuration files have been removed. Wrangler 4.151.0 remains the CLI's build engine and provides the test harness API. Native application code is unchanged by this migration.
