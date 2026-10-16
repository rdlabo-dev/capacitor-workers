# Capacitor Workers demo

This demo shows the setup needed to run an existing Workers Fetch Handler inside Capacitor. Start with the application files below; compatibility tests have their own sources and build.

## 1. Choose your existing Worker

[vite.config.ts](vite.config.ts) points the plugin at the Worker entry:

```ts
plugins: [capacitorWorkersPlugin({ worker: "./workers/hono/standard.ts" })];
```

The path is relative to the configured Vite root, `src/`. The example uses [the Hono Worker](src/workers/hono/standard.ts). To try [Workers Express](src/workers/express/standard.ts), change it to `./workers/express/standard.ts`.

## 2. Initialize the runtime

[src/main.ts](src/main.ts) contains the complete runtime setup:

```ts
import { capacitorWorkers } from "@rdlabo/capacitor-workers";

const runtime = capacitorWorkers({
  baseURL: "https://worker.invalid/api/",
});
await runtime.ready;
```

`baseURL` selects the API origin and path handled locally. Here, `/api/...` calls run in the configured Worker without contacting `worker.invalid`.

## 3. Use ordinary fetch calls in your screen

[src/ui/display.ts](src/ui/display.ts) waits for initialization, calls `fetch("/api/hello?name=Capacitor")`, and displays the response. This is example screen code; it is not additional library configuration.

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

## Compatibility tests

`tests/validation/` and `tests/fixtures/` contain the validation app and test-only Workers. `npm run test:browser` builds and serves the validation app separately. The normal `src/` application and its build do not depend on these files. See the [repository testing guide](../README.md#development-and-testing) for the full test commands.

This example currently demonstrates local API execution. Porting a complete Hono + TSX application, including initial HTML rendering, navigation and form submission, remains the next goal.
