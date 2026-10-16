import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { FeatureImplementation } from "@rdlabo/capacitor-workers/features";
import { fetchFeature } from "@rdlabo/capacitor-workers/features/fetch";
import {
  assertContract,
  runContract,
  type ContractResult,
} from "@rdlabo/capacitor-workers/testing";
import { fetchContract } from "../../features/contracts";
const http = createTestHarness({
  workers: [
    {
      config: {
        name: "feature-fetch",
        main: "workers/features/fetch.ts",
        compatibility_date: "2026-10-01",
      },
    },
  ],
});
const services = createTestHarness({
  workers: [
    {
      config: {
        name: "feature-services",
        main: "workers/features/services.ts",
        compatibility_date: "2026-10-01",
        kv_namespaces: [
          { binding: "TEXT", id: "00000000000000000000000000000001" },
        ],
      },
    },
  ],
});
beforeAll(async () => {
  await http.listen();
  await services.listen();
});
afterAll(async () => {
  await http.close();
  await services.close();
});
class WorkersFetch extends FeatureImplementation<typeof fetchFeature> {
  constructor() {
    super(fetchFeature, {
      request: { status: "supported" },
      response: { status: "supported" },
      missing: { status: "supported" },
      head: { status: "supported" },
    });
  }
  create(): typeof fetch {
    return async (input, init) => {
      const request = new Request(input, init);
      const response = await http.fetch(request.url, {
        method: request.method,
        headers: [...request.headers],
        body: request.body ? await request.arrayBuffer() : undefined,
      });
      const body = await response.arrayBuffer();
      return new Response(request.method === "HEAD" ? null : body, {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers],
      });
    };
  }
}
it("runs the shared HTTP contract against real workerd", async () => {
  const report = await runContract(new WorkersFetch(), fetchContract);
  assertContract(report);
  expect(report.cases.map((test) => test.status)).toEqual(
    Array(4).fill("passed"),
  );
});
it("runs the same state and engine contracts against actual workerd KV and WebAssembly", async () => {
  const reports = (await (
    await services.fetch("/contracts")
  ).json()) as ContractResult[];
  expect(reports).toHaveLength(2);
  for (const report of reports) assertContract(report);
  expect(reports.map((report) => report.cases.length)).toEqual([3, 2]);
  expect(
    reports
      .flatMap((report) => report.cases)
      .every((test) => test.status === "passed"),
  ).toBe(true);
});
