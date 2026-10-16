import { verifyKVPersistence } from "./kv";
import { FetchImplementation } from "@rdlabo/capacitor-workers/features/fetch";
import { assertContract, runContract } from "@rdlabo/capacitor-workers/testing";
import worker from "../workers/features/fetch";
import isolated from "../workers/features/fetch?capacitor-worker";
import { fetchContract, textContract, wasmContract } from "./contracts";
import { PersistentText, WasmValidation } from "./implementations";
export async function runFeatures() {
  await verifyKVPersistence();
  const reports = [];
  for (const [name, entry] of [
    ["direct", worker],
    ["isolated", isolated],
  ] as const) {
    const report = await runContract(
      new FetchImplementation({
        worker: entry,
        baseURL: "https://worker.invalid/api",
      }),
      fetchContract,
    );
    reports.push({ environment: name, ...report });
  }
  reports.push({
    environment: "webview",
    ...(await runContract(new PersistentText(), textContract)),
  });
  reports.push({
    environment: "webview",
    ...(await runContract(new WasmValidation(), wasmContract)),
  });
  for (const report of reports) assertContract(report);
  return reports;
}
