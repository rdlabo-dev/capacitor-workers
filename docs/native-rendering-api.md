# Native document rendering through capacitorWorkers

The source API is implemented and tested with the repository's native integration.
Native npm/SPM/Gradle packaging is deliberately deferred. Installing the existing
npm package alone does not yet install the native integration; startup reports a
missing-plugin error rather than silently falling back to DOM replacement.

## Application entry

```ts
import { capacitorWorkers } from "@rdlabo/capacitor-workers";

const app = capacitorWorkers({
  baseURL: "https://worker.invalid",
  render: "/",
});
await app.ready;
```

`render` is the initial local document path. Omit it to retain the existing
Fetch-only behavior. Document mode requires an HTTP(S) **origin** as `baseURL`,
without an API path prefix. The Worker receives URLs under that logical origin;
the visible page retains its Capacitor local URL (`capacitor://` on default iOS,
`https://` on default Android). No remote fallback or local HTTP server is used.

Hono and Workers Express use the same `worker.fetch(request, env, ctx)` boundary.
Their application routers return complete HTML for pages and JSON for APIs. The
adapter does not add an application router. Existing `worker`, `env`, `prefer`,
`drain()` and background-error handling continue to apply to the runtime host.

`ready` means that the Worker and native connection are initialized. It does not
mean all images or page scripts have finished loading. `await app.dispose()`
releases the document connection and runtime. Fetch-only disposal remains
synchronous. Startup errors restore the original fetch implementation.

## Build configuration

The existing Vite or esbuild plugin automatically prepares document assets:

```ts
capacitorWorkersPlugin({
  worker: "./workers/hono.tsx", // Or the Workers Express entry.
});
```

Only `render` selects document rendering at runtime; it is unrelated to whether
the application uses `form[action]`. Builds include the small internal assets
even for Fetch-only applications, but do not register a Service Worker or start
native document rendering unless `render` is set.

For native rendering, use Vite with `base: '/'` and build before Capacitor
copy/sync. The Vite dev server remains available for Fetch-only development;
native document rendering requires bundled assets. esbuild writes the assets
next to its `outfile` or into `outdir` (in-memory `write: false` builds do not
prepare native document assets). Place any separately copied static files in
the output directory before building so they appear in the asset manifest.

The generated `capacitor-workers-assets.json` identifies bundled assets, which
bypass the Worker router. All other local paths reach the Worker. Android uses
`capacitor-workers-sw.js` for browser-native Request/Response and redirect
handling. These filenames are implementation assets, not application imports.
A raw-ESM setup must supply the equivalent SW file and asset manifest itself;
the automated asset integration currently covers Vite and esbuild.

## Native implementation

- iOS keeps the ordinary application controller. The plugin retains its existing
  WebView as the runtime host and adds an internal document controller. Its scheme
  handler is registered before the document WebView is created. The host invokes
  the same Fetch Handler through the library's existing Worker transport.
- Android keeps the ordinary Activity and visible WebView. The plugin creates a
  persistent host, using the bundled bootstrap's internal host mode. A Service
  Worker forwards requests to that host and serves responses through normal
  browser navigation. The bootstrap executes again in the host, so application
  startup side effects should not be placed after or alongside runtime startup.
- The package's native sources live under `native/`. Test overlays compile those
  sources directly into the demo until packaging is added. Measurement/report
  hooks live under `demo/tests/`; they are not in the native implementation.

No application Activity/ViewController replacement, iframe, Turbo, or HTML DOM
replacement is required. The two-WebView lifecycle is internal to the adapter.

## Scope and limits

This remains a PoC. Document rendering is native-only; ordinary browser/Electron/
Tauri document startup is not implemented. Existing browser Fetch-only behavior
is unchanged. Full response bodies are buffered. HTTP caching is disabled for
Worker responses. External redirects are rejected. On iOS, the page-side Fetch
bridge models redirect metadata with JavaScript properties rather than browser
internal Response slots. The iOS multipart form supplement covers same-window
local POST submissions; named windows and iframe targets are not supported.

The native host/child lifecycle, pending-request timeouts and explicit disposal
are implemented. Physical devices, OS process termination/recovery, memory
pressure, arbitrary third-party plugin lifecycle behavior, and native package
installation are not covered by the simulator/emulator acceptance results.

## Demo and validation

[demo/rendering](../demo/rendering) contains readable Hono/TSX and Workers Express
examples: root HTML, links, POST followed by a 303 redirect, and a JSON endpoint.
The normal Fetch-only demo remains separate.

`tests/unit/documents.test.ts` exercises the public entry, startup errors,
restoration, disposal and routing. Service Worker tests cover POST bytes,
redirect mapping and asset manifest changes after an update. Both Vite and
esbuild build the public entry in `demo/tests/build/documents.test.ts`.

The native acceptance app at `demo/tests/fixtures/apps/public-documents` calls
`capacitorWorkers({ baseURL, render })`. It selects Hono or Express through the
build plugin and uses the existing full document test driver. Native test wiring
is temporary and restored after each run. See `demo/tests/README.md` for commands.

### Acceptance results

Verified on 2026-10-16 through the public startup API:

| Target              | Hono  | Workers Express |
| ------------------- | ----- | --------------- |
| iOS 26.1 Simulator  | 65/65 | 65/65           |
| Android 16 emulator | 50/50 | 50/50           |

Android Hono also passed 50/50 with a persisted Service Worker after process
restart and updated bundled assets. This caught and fixed a Vite hook-order issue
where the generated Dedicated Worker asset was initially missing from the
manifest. Build tests now require every emitted file to appear in the manifest.

Additional checks: library tests 119/119, rendering builds 4/4 (Vite/esbuild ×
Hono/Express), Workers tests 58/58, existing Fetch-only browser tests 8/8, and
library/demo typechecks. Reports are saved locally under
`demo/artifacts/public-documents-*`; native overlays and debug forwarding are
removed after validation.
