import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import {
  assertContract,
  type ContractResult,
} from "@rdlabo/capacitor-workers/testing";
const harness = createTestHarness({
  workers: [
    {
      config: {
        name: "host-globals",
        main: "tests/fixtures/workers/compatibility/host-globals.ts",
        compatibility_date: "2026-10-17",
      },
    },
  ],
});
beforeAll(() => harness.listen());
afterAll(() => harness.close());
it("runs encoding and abort contracts in pinned workerd", async () => {
  const reports = (await (await harness.fetch("/")).json()) as ContractResult[];
  expect(reports.map((report) => report.cases.length)).toEqual([6, 6]);
  for (const report of reports) assertContract(report);
});
