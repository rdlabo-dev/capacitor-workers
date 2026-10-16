# Capacitor Workers demo

This demo shows the setup needed to run an existing Workers Fetch Handler inside Capacitor. Start with the application files below; compatibility tests have their own sources and build.

## 1. Choose your existing Worker

[vite.config.ts](vite.config.ts) points the plugin at the Worker entry:

```ts
plugins: [capacitorWorkersPlugin({ worker: "./workers/hono/standard.ts" })];
```

The path is relative to the configured Vite root, `src/`. The example uses [the Hono Worker](src/workers/hono/standard.ts). To try [Workers Express](src/workers/express/standard.ts), change it to `./workers/express/standard.ts`.

## 2. Initialize the runtime

[src/main.ts](src/main.ts) initializes the runtime, waits for it to be ready, and starts the app:

```ts
import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import { startApp } from "./app";

const runtime = capacitorWorkers({
  baseURL: "https://worker.invalid/api/",
});
await runtime.ready;
await startApp();
```

`baseURL` selects the API origin and path handled locally. Here, `/api/...` calls run in the configured Worker without contacting `worker.invalid`.

## 3. Use ordinary fetch calls in your screen

[src/app.ts](src/app.ts) calls `fetch("/api/hello?name=Capacitor")`, and displays the response. This is example screen code; it is not additional library configuration.

## Run the demo

From the repository root:

```sh
npm ci
npm run build
cd demo
npm ci
npm run dev
```

For the native app, run these from `demo/` with the native SDKs installed:

```sh
npm run build
npm run sync
npm run ios
# Or: npm run android
```

## Directory guide

| Location                                                        | Purpose                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/`                                                          | The example application: initialization, API call, and existing Workers.                                           |
| `vite.config.ts`, `capacitor.config.ts`, `cloudflare.config.ts` | Build and execution settings for the example application.                                                          |
| `ios/`, `android/`                                              | Capacitor native projects for running the example.                                                                 |
| `tests/`                                                        | Automated checks, test-only apps and Workers, and test preparation scripts. See [the test guide](tests/README.md). |
| `dist/`, `artifacts/`, `test-results/`                          | Generated application builds, validation builds/evidence, and test output. Not source files.                       |

## Compatibility tests

`tests/validation/` and `tests/fixtures/` contain the validation app and test-only Workers. `npm run test:browser` builds and serves the validation app separately. The normal `src/` application and its build do not depend on these files. See the [repository testing guide](../README.md#development-and-testing) for the full test commands.

This example currently demonstrates local API execution. Porting a complete Hono + TSX application, including initial HTML rendering, navigation and form submission, remains the next goal.
