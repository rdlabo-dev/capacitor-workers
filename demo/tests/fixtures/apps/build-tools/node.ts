import {
  capacitorWorkers,
  type ExecutionPreference,
} from "@rdlabo/capacitor-workers";

// The configured worker is tests/fixtures/workers/compatibility/node-contracts.ts
// for this build; direct executes it in-page, worker executes it as a
// Dedicated Worker bundled by the same plugin.
async function run(prefer: ExecutionPreference) {
  const runtime = capacitorWorkers({
    baseURL: "https://node.invalid/",
    prefer,
  });
  try {
    await runtime.ready;
    return {
      execution: runtime.execution,
      contracts: await (await fetch("/")).json(),
    };
  } finally {
    runtime.dispose();
  }
}
declare global {
  interface Window {
    runNodeBuild: typeof run;
  }
}
window.runNodeBuild = run;
