# Compatibility CI and merge protection

`.github/workflows/ci.yml` runs on every pull request, pushes to main, merge queues and manual dispatch. There are no path filters, secrets or privileged pull-request triggers. Official actions are pinned to commit SHAs; the token is read-only and checkout does not persist credentials. Node 22 matches the current local validation baseline.

| Job           | Required evidence                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| library       | Strict typechecking including negative type tests, library build, unit/contract tests                                                                                                     |
| compatibility | Independent demo install/typecheck, actual local workerd (explicit Hono/Express and shared profiles), Chromium/WebKit production tests, isolated runtime tests and Vite development tests |
| package       | Fresh npm tarball consumer: exported types and direct/isolated/common-profile browser checks                                                                                              |

`CI` aggregates all three jobs. It runs even if a dependency fails and accepts only `success` from every dependency; failed, cancelled and skipped jobs cannot produce a passing gate. Vitest rejects focused tests through `--allowOnly=false`; Playwright rejects them when `CI` is set. Playwright uses one worker on CI to limit resource contention. The demo remains an independent package, not an npm workspace.

The shared profile integrations require every declared case to pass. The generic `assertContract` intentionally permits explicit partial coverage; it alone is not proof of full profile compatibility. Removing cases or weakening assertions still requires human review.

## Repository setting required after publication

A workflow by itself does not prevent merging. Configure a main branch ruleset after the workflow has produced its first check:

- Require a pull request before merging.
- Require the `CI` status check from GitHub Actions and an up-to-date branch.
- Block force pushes and branch deletion; apply the rule without routine bypasses.
- Do not require a second maintainer's approval by default for a single-maintainer repository.

These settings are not applied by the workflow. At review time, main had no branch protection and the repository had no rulesets. Repository settings require separate maintainer authorization. A required check cannot prevent an authorized contributor from weakening the workflow itself; review workflow and contract changes explicitly.

## Verification boundary

Linux Chromium/WebKit and local workerd are automatic gates. They do not establish iOS/Android native WebView behavior, physical-device behavior, cloud deployment behavior, cloud synchronization or full V8 compatibility. Native validation remains a separate acceptance step for transport/runtime/platform-affecting changes. Record the tested commit, OS/WebView versions and actual results in `verification.md`; do not carry earlier native passes forward as evidence for later code.

No simulator/emulator job is claimed here: the existing manual native procedure has not yet been reproduced on GitHub-hosted runners. The packed consumer intentionally installs into a fresh temporary project; it tests package usability separately from the lockfile-controlled library/demo installs.

`.github/workflows/codeql.yml` is a separate analysis workflow. Its Swift job prepares the iOS demo and compiles the app with `xcodebuild` on a macOS runner to give CodeQL a real build, but it performs no simulator launch and no native acceptance — those remain local `test:native:package` runs on a developer machine.
