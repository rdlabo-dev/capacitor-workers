# Demo verification

These files verify the library. For the setup to copy into your application, start with [the demo guide](../README.md) and `../src/`.

## What belongs where

| Location                                     | Role                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `browser/`                                   | Playwright assertions for the same HTML demo with Hono/Express and for the compatibility page.                               |
| `runtime/`                                   | Playwright assertions for Worker isolation, request/response transport, execution preference, and bindings.                  |
| `build-tools/`                               | Playwright assertions for Vite, esbuild, and browser ES Modules.                                                             |
| `build/`                                     | Vitest assertions for the esbuild watch integration.                                                                         |
| `workers/`                                   | Vitest checks running Hono, Express, and compatibility handlers in local workerd.                                            |
| `validation/`                                | The compatibility page, shared check runners/contracts, and Worker entry wrappers.                                           |
| `fixtures/apps/runtime/`                     | A browser/native test app that exposes runtime operations to the tests. Formerly the dedicated Worker experiment.            |
| `fixtures/apps/build-tools/`                 | Test apps built with Vite/esbuild or loaded as plain JavaScript. These are build inputs, not build scripts.                  |
| `fixtures/workers/`                          | Test-only Fetch Handlers used by the verification apps and workerd tests.                                                    |
| `scripts/`                                   | Node.js preparation scripts. `build-tools.mjs` builds the build-tool test apps and copies the plain JavaScript distribution. |
| `playwright*.config.ts`, `vitest*.config.ts` | Test discovery, browsers, local servers, and runner settings.                                                                |

The application under `src/` never imports these files. Tests may import the real demo Workers to check the same code a user runs.

`vite.express.config.ts` imports the ordinary demo Vite config and replaces its Worker selection with Express. Its output is isolated under `artifacts/demo-express`; the default Hono demo remains in `dist`. `test:browser` builds both variants and checks their rendered HTML, so switching frameworks is tested using the actual demo sources.

## Commands

Run from `demo/` after building the library and installing demo dependencies:

```sh
npm run typecheck
npm run build
npm run test:browser
npm run test:runtime
npm run test:runtime:dev
npm run test:build-tools
npm run test:workers
npm run test:documents
```

`test:runtime` builds the runtime test app before running Playwright. `test:build-tools` runs the build checks, prepares the build-tool test apps using `scripts/build-tools.mjs`, then runs Playwright. Their generated files go to `../artifacts/`.

## Native checks

Prepare a test app in Capacitor's ordinary `dist/` directory, then sync and run:

```sh
npm run test:native:prepare -- validation
# Or: npm run test:native:prepare -- runtime
npm run sync
npm run ios
# Or: npm run android
```

The preparation command builds the selected test app and replaces only the generated `dist/` directory. The normal Capacitor configuration does not change. Restore the example application with `npm run build`, then `npm run sync`.

Native coverage and previous results are documented in [the runtime verification guide](../../docs/runtime-contract.md).

## Native document loading experiment

`fixtures/apps/native-documents/` hosts the existing Worker transport independently of the visible page. `native/documents/` contains temporary iOS/Android request bridges and a navigation test driver. Hono/TSX and Express generate the documents; the visible WebView performs normal document navigation without Turbo. iOS injects `page-fetch.ts` at document start to test JavaScript fetch separately from native document loading. `scripts/build-native-documents.mjs` bundles that experimental entry with esbuild; it is not application setup code.

See [the native document investigation](../../docs/document-rendering.md) for setup, native source overlay/restoration, evidence, and unsupported behavior. Do not run the native experiment without its overlay, or leave the overlay applied to the ordinary demo.

`documents/` tests the experimental Service Worker document path in Chromium and WebKit. Android uses that path; native iOS uses a custom-scheme handler instead. Six WebKit comparison cases currently have explicit expected-failure annotations, documented in the investigation. `native/documents/` tests must still be run on the native platforms.

`page-fetch.spec.ts` verifies the injected iOS script through a mocked native message hop and the real Worker. `form-body.ts` supplies multipart bytes before starting a native POST navigation; it does not replace HTML. The native driver additionally verifies file-input form navigation, redirect replay and back history.

### Ordinary-plugin document connection investigation

See [the connection plan and results](../../docs/document-connection-plan.md).
These probes compare connection mechanisms; they are not consumer setup steps.

- `node tests/scripts/test-native-connection.mjs <iOS-simulator-UUID>` checks why
  late scheme registration and `loadHTMLString` do not satisfy native document
  history. It restores the original SceneDelegate in a `finally` block.
- For the successful iOS plugin-owned view probe, prepare `native-documents` for
  Hono or Express, run `cap copy ios`, apply `native-plugin-document-overlay.mjs`,
  then run `run-plugin-document-probe.mjs <UUID> hono|express`. Always restore the
  overlay afterwards. The parent remains the standard Capacitor controller.
- For Android, prepare and copy the same assets, apply
  `android-plugin-document-overlay.mjs`, build/install/launch, forward the app's
  WebView CDP socket to port 9227, then run
  `capture-plugin-document-android.mjs hono|express`. Restore the overlay and
  remove the debug forward afterwards. MainActivity is never changed.
- `node tests/experiments/document-replacement.mjs` reproduces the module-script
  lifecycle limitation of persistent-window HTML replacement in both browsers.

The overlay registrations and injected drivers belong only to these experiments.
Automatic npm/SPM packaging and startup through the final public API remain a
separate acceptance step.

### Public native rendering API

The public-entry fixture calls `capacitorWorkers({ baseURL, render })`; it does
not call the experimental startup plugin. Native sources are taken directly from
`native/` until distribution packaging is introduced.

1. Build the library, then run `npm run test:rendering:prepare -- hono` (or
   `express`) from `demo/` and run `npx cap copy`.
2. iOS: apply `tests/scripts/public-document-overlay.mjs`, then run
   `tests/scripts/run-plugin-document-probe.mjs <UUID> hono|express --public-api`.
   Restore the overlay afterwards. Reports are `artifacts/public-documents-*-ios.json`.
3. Android: apply `tests/scripts/android-public-document-overlay.mjs`, run a
   **clean** Gradle debug build, install and launch. Forward that process's WebView
   CDP socket to port 9227 and run
   `tests/scripts/capture-plugin-document-android.mjs hono|express --public-api`.
   Restore the overlay afterwards. Reports/screenshots use the `public-documents-`
   prefix. Remove the CDP forward when finished.

Unlike the original experiment, the public-entry driver leaves the Android
Service Worker registered. Force-stop and relaunch the app to verify startup
with a persisted Service Worker, then capture a second fresh report. The driver
clears its prior report on the first page and only exposes the final report element
when navigation checks finish. When switching back to the Fetch-only demo,
pass `--cleanup` to the capture script to unregister the document Service Worker in the installed test app.

The native overlays only register the source integration and inject the test
driver/report collection. No diagnostic hooks are in `native/` itself. Keep all
three concerns separate: application code (`rendering/`), library implementation
(`../src`, `../native`), and instrumentation (`tests/`).
