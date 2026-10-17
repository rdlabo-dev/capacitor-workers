import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import type { ContractResult } from "@rdlabo/capacitor-workers/testing";

let source: string;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const result = await build({
    absWorkingDir: root,
    stdin: {
      contents: `
        import { runWebApiContracts } from "./demo/tests/validation/web-api-contracts.ts";
        globalThis.runWebApiContracts = runWebApiContracts;
      `,
      resolveDir: root,
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
  });
  source = result.outputFiles[0].text;
});

for (const execution of ["direct", "worker"] as const) {
  test(`Web API candidate contracts in ${execution}`, async ({ page }) => {
    await page.goto("about:blank");
    const report = await page.evaluate(
      async ({ source, execution }) => {
        if (execution === "direct") {
          const script = document.createElement("script");
          script.textContent = source;
          document.head.append(script);
          return (
            globalThis as unknown as {
              runWebApiContracts(): Promise<ContractResult[]>;
            }
          ).runWebApiContracts();
        }
        const url = URL.createObjectURL(
          new Blob(
            [
              source,
              ";runWebApiContracts().then(report => postMessage(report));",
            ],
            { type: "text/javascript" },
          ),
        );
        const worker = new Worker(url);
        try {
          return await new Promise<ContractResult[]>((resolve, reject) => {
            worker.onmessage = (event) => resolve(event.data);
            worker.onerror = (event) => reject(new Error(event.message));
          });
        } finally {
          worker.terminate();
          URL.revokeObjectURL(url);
        }
      },
      { source, execution },
    );
    expect(report.map((result) => result.cases.length)).toEqual([
      8, 8, 8, 4, 11,
    ]);
    for (const result of report) {
      expect(result.errors).toEqual([]);
      expect(result.cases.filter((test) => test.status !== "passed")).toEqual(
        [],
      );
    }
  });
}
