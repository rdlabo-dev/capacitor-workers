import { runContract, type Result } from "../../tests/validation/contracts/http";

export async function runFrameworkContract(
  framework: "hono" | "express",
): Promise<Result[]> {
  const fetcher = globalThis.fetch;
  const results = await runContract(fetcher);
  for (const [name, check] of [
    [
      "Request input",
      async () => {
        const response = await fetcher(
          new Request("https://worker.invalid/api/echo", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"request":true}',
          }),
        );
        return (
          response.status === 201 && (await response.json()).request === true
        );
      },
    ],
    [
      "logical URL + framework identity",
      async () => {
        const response = await fetcher("/api/url");
        const value = await response.json();
        return (
          value.url === "https://worker.invalid/api/url" &&
          response.headers.get("x-framework") === framework
        );
      },
    ],
  ] as const) {
    try {
      results.push({ name, ok: await check() });
    } catch (error) {
      results.push({ name, ok: false, error: String(error) });
    }
  }
  return results.map((result) => ({
    ...result,
    name: `${framework}: ${result.name}`,
  }));
}
