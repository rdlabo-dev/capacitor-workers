# Architecture review — 2026-10-16

Baseline: merged main `acab46f`. This review covers module boundaries, extension contracts, verification and merge enforcement. It is not a new native acceptance run or a claim of complete Workers compatibility.

## Findings

1. **High: no automatic merge gate.** The repository had neither checked-in CI workflows nor main branch protection/rulesets. Existing contract tests could therefore regress without blocking a merge. The accompanying workflow runs the existing library, workerd/browser and packed-consumer checks and aggregates them into `CI`. Main protection remains a separate repository setting; see [CI setup](ci.md).
2. **Medium: KV's public API is derived from its implementation.** `KVNamespace` is a `Pick<StorageNamespace, ...>`. This preserves today's method shapes, but changing implementation signatures also changes the contract, weakening independent static verification. Resolved in the follow-up: `KVNamespace` is now an independent interface in `types.ts`, and `StorageNamespace` implements it. Existing overloads and public exports are preserved, with negative type tests for incomplete backends and invalid read modes. No runtime behavior changes.
3. **Medium: native evidence is not a per-commit gate.** Final KV guardrail/Unicode fixes have browser/workerd evidence but were not rerun natively. Historical native results are correctly labelled in `verification.md`; they must not be read as validation of current main. Establish reproducible hosted native runs separately before making them required checks.

## Boundaries to retain

- The root publishes only the library build. The independent demo owns frameworks, workerd fixtures, browser tests and native projects. No workspace or native plugin is needed for the TypeScript adapter.
- `Feature` defines typed identity and behavioral cases. `FeatureImplementation` declares coverage and supplies the API; `openFeature` owns rollback and cleanup. Runtime input/backend guardrails remain in each implementation.
- `runContract` does not import fetch, KV or engine APIs. Real workerd and local implementations share assertions, while persistence, capacity and implementation rejection tests remain separate. New API categories should not require edits to this host.
- `FetchRuntime` governs request execution and transport. `FeatureImplementation` governs feature setup and compatibility declarations. Their separate responsibilities justify retaining both; combining them would couple non-fetch APIs to HTTP execution.
- Exported `fetch.basic` covers four portable HTTP behaviors. The detailed 15-case fetch suite and framework/transport regressions are still necessary. A profile pass is evidence for its documented cases, not the full Workers specification.
- The engine profile checks a narrow WebAssembly behavior in the current engine. It does not emulate workerd or provide V8 inside a WebView. KV is local persistence; isolated binding RPC and cloud synchronization remain outside the implemented scope.

## Next extension rule

For the next backend/API, define the independent API and bounded profile first, provide implementation guardrails and explicit coverage, run the same assertions against the real Workers reference, add backend-specific tests, then connect the integration to the existing CI jobs. Do not introduce a registry, generic operation protocol or new test runner unless a concrete implementation demonstrates the need.

## Validation of the CI change

Local Node 22.23.2: root/demo typechecks and library build passed; root unit tests 90/90; local workerd 27/27; Chromium/WebKit ordinary 4/4, isolated 26/26 and development 4/4 with `CI=1`; packed consumer direct 26/26, isolated 22/22 and common profiles 28/28. `actionlint` and whitespace checks passed. Existing broad-polyfill bundle-size and `vm-browserify` eval warnings remain. The GitHub-hosted Linux workflow has not run yet; local execution does not validate hosted installation or Linux browser behavior. No native run, PR publication or repository-setting change was performed.

After separating the KV interface, root/demo typechecks, library build, 90 unit tests and the packed consumer (direct 26/26, isolated 22/22, common 28/28) pass again. The extraction changes types only; native tests were not repeated.
