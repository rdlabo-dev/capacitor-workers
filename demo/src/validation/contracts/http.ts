export interface Result {
  name: string;
  ok: boolean;
  error?: string;
}
export async function runContract(
  fetcher: typeof fetch,
  base = "/api",
): Promise<Result[]> {
  const results: Result[] = [];
  const check = async (name: string, test: () => Promise<void>) => {
    try {
      await test();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: String(error) });
    }
  };
  const equal = (actual: unknown, expected: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(
        `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
      );
  };
  await check("GET + query", async () => {
    const res = await fetcher(`${base}/hello?name=Capacitor`);
    equal(res.status, 200);
    equal(await res.json(), {
      message: "Hello from Workers",
      name: "Capacitor",
    });
  });
  await check("POST JSON + status", async () => {
    const res = await fetcher(`${base}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "日本語 🍷", value: 42 }),
    });
    equal(res.status, 201);
    equal(await res.json(), { text: "日本語 🍷", value: 42 });
  });
  await check("Router + params", async () => {
    equal(await (await fetcher(`${base}/items/123`)).json(), { id: "123" });
  });
  await check("Middleware header", async () => {
    const response = await fetcher(`${base}/hello`);
    await response.text();
    if (!response.headers.get("x-framework"))
      throw new Error("Missing middleware header");
  });
  await check("404", async () => {
    const response = await fetcher(`${base}/missing`);
    equal(response.status, 404);
    await response.text();
  });
  await check("Error middleware", async () => {
    const res = await fetcher(`${base}/error`);
    equal(res.status, 500);
    equal(await res.json(), { error: "expected failure" });
  });
  await check("204 empty body", async () => {
    const res = await fetcher(`${base}/empty`);
    equal(res.status, 204);
    equal(await res.text(), "");
  });
  await check("HEAD", async () => {
    const res = await fetcher(`${base}/hello`, { method: "HEAD" });
    equal(res.status, 200);
    equal(await res.text(), "");
  });
  await check("Concurrent requests", async () => {
    const values = await Promise.all(
      ["a", "b", "c"].map(async (id) =>
        (await fetcher(`${base}/items/${id}`)).json(),
      ),
    );
    equal(values, [{ id: "a" }, { id: "b" }, { id: "c" }]);
  });
  return results;
}
