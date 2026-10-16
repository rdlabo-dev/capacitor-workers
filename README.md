# @rdlabo/capacitor-workers

Small, experimental PoC: run a Cloudflare Workers fetch handler in a Capacitor WebView. No API server, socket listener, or remote fallback is used for intercepted requests. This executes JavaScript in the WebView; it does not compile Workers code to native code.

## Usage

```ts
import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import worker from "./worker";

const runtime = capacitorWorkers({
  worker,
  baseURL: "https://api.example.com/api/",
});

// Existing UI calls stay unchanged.
const response = await fetch("/api/hello");
```

`worker` is the imported module's default export containing `fetch`, not a file path. Installation is synchronous; call it before starting UI code that makes API requests. `await capacitorWorkers(...)` also works, but is not required. Only one installation is supported; `runtime.dispose()` restores fetch.

### URL contract

With the example base URL:

| Input                               | Behaviour                                                        |
| ----------------------------------- | ---------------------------------------------------------------- |
| `/api/hello?name=A`                 | Local Worker receives `https://api.example.com/api/hello?name=A` |
| `https://api.example.com/api/hello` | Same local execution                                             |
| `/api`                              | Local execution                                                  |
| `/apiary`, `/outside.txt`           | Original fetch                                                   |
| `https://other.example/api/hello`   | Original fetch                                                   |

The path in `baseURL` selects a boundary; it is **not appended** to request paths. Relative paths resolve against the document URL first. Same-app URLs (including iOS `capacitor://localhost`) in the boundary are remapped to the base origin. Set a root base URL only if you intend to intercept every same-app fetch. A local 404/500 or exception never retries against the network. UI navigation, XHR, images and other WebViews are not intercepted.

## Workers Express

The sample uses the real `express` package and the Workers entry style:

```ts
import express from "express";
import { httpServerHandler } from "cloudflare:node";

const app = express();
app.use(express.json());
app.get("/api/hello", (_req, res) => res.json({ hello: "world" }));
app.listen(3000);
export default httpServerHandler({ port: 3000 });
```

For the Capacitor/browser build, add the build adapter:

```ts
import { defineConfig } from "vite";
import { capacitorWorkersPlugin } from "@rdlabo/capacitor-workers/vite";

export default defineConfig({ plugins: [capacitorWorkersPlugin()] });
```

Keep this plugin out of the Cloudflare build. It supplies limited Node HTTP compatibility and browser polyfills. `listen(3000)` registers an in-memory handler, not a listening TCP port. Hono's Web Standards-only handlers need only the runtime import; they do not need this plugin.

## Run this repository

Requires Node 22.12+, npm, and the native SDKs for native tests. Package publication, PR creation and cloud deployment are not part of these commands.

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run build:demo
npx playwright install chromium webkit
npm run test:browser
npm run test:workers
npm run test:package
```

`test:workers` starts temporary **local workerd** processes and runs the same API contract used by the WebView. It is not a live Cloudflare deployment. `test:package` installs an actual npm tarball into a fresh temporary consumer and checks both frameworks without handwritten aliases/polyfills.

For the native demo:

```sh
npx cap sync
npx cap run ios
npx cap run android
```

Android requires Java 21+. The demo bundles both Workers and runs 26 checks automatically. No `server.url` or development server is configured in Capacitor. Results appear in the UI and as `POC_RESULT` in the native console. Browser tests additionally re-run 18 API checks with networking disabled.

## PoC compatibility boundary

- Covered: Hono and Workers Express GET/POST/HEAD, query and route params, JSON bodies, middleware, 404/500, concurrent requests, Request input, logical URLs.
- Optional `env` injects caller-provided values into the fetch handler's second argument. No Wrangler secrets or bindings are imported. `cloudflare:workers` named `env` access currently throws a diagnostic; it is not the injected argument.
- `ctx.waitUntil()` tracks promises without delaying the response; `runtime.drain()` waits for them. Errors go to optional `onBackgroundError` (default: console). OS suspension/termination can stop pending work.
- Fetch abort rejects the caller and propagates a signal. It cannot forcibly stop arbitrary application work. Cookies, redirect following, `Response.url` population, credentials/cache policies and CORS enforcement are not emulated for local calls.
- Express request/response bodies are buffered. Streaming, file serving, compressed request bodies, WebSockets, arbitrary Node APIs and async context propagation are not guaranteed. The compatibility layer is not a general Node runtime.
- `passThroughOnException`, WorkerEntrypoint/RPC, Service Worker format and Workers-specific Request fields are unsupported. Worker evaluation must not fetch its own local endpoints before installation.
- CapacitorHttp's fetch patch is not tested; leave it disabled for this PoC. No native code was added beyond the generated Capacitor projects.
- Client bundles are readable by users. Do not bundle server secrets or privileged backend logic. Unsupported operations do not automatically connect to cloud resources.

## Next phases

1. Keep the runtime small and validate Hono/Workers Express against real WebViews.
2. Add binding adapters: D1 → Capacitor SQLite, KV → local storage provider, R2 → Capacitor Filesystem; compare API behaviour against Workers. Local data is independent of cloud data; sync is separate.
3. Expand setup automation, compatibility and browser/Electron/Tauri execution. Preserve the explicit `worker` + `baseURL` entry API.

The combined Hono + Express demo currently includes broad Node polyfills; bundle size is a PoC finding, not an optimized release. See `docs/verification.md` for measured results and limitations.
