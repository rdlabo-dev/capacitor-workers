import {
  capacitorWorkers,
  type ExecutionPreference,
} from "@rdlabo/capacitor-workers";
import { runContract } from "../contract";

async function run(prefer: ExecutionPreference) {
  // Both build integrations provide the configured entry; no special import.
  const runtime = capacitorWorkers({
    baseURL: "https://worker.invalid/api",
    prefer,
  });
  try {
    await runtime.ready;
    return { execution: runtime.execution, cases: await runContract(fetch) };
  } finally {
    runtime.dispose();
  }
}
declare global {
  interface Window {
    runBuildTool: typeof run;
  }
}
window.runBuildTool = run;
