# Demo verification

These files verify the library. For the setup to copy into your application, start with [the demo guide](../README.md) and `../src/`.

## What belongs where

| Location                                     | Role                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `browser/`                                   | Playwright assertions for the minimal demo and compatibility page.                                                           |
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
```

`test:runtime` builds the runtime test app before running Playwright. `test:build-tools` runs the build checks, prepares the build-tool test apps using `scripts/build-tools.mjs`, then runs Playwright. Their generated files go to `../artifacts/`.

Native test selection and the existing `CAPACITOR_WORKERS_EXPERIMENT=1` flag are documented in [the runtime verification guide](../../docs/runtime-contract.md). The default Capacitor build remains the application under `src/`.
