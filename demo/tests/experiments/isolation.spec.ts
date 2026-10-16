import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => typeof window.startExperiment === "function",
  );
  await page.evaluate(() => {
    window.experiment = window.startExperiment(location.origin);
  });
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.experiment?.dispose());
});

test("outbound fetch stays outside local dispatch across await, concurrency and waitUntil", async ({
  page,
  context,
}) => {
  const background: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route("**/api/upstream?*", (route) =>
    route.fulfill({
      body: `upstream:${new URL(route.request().url()).searchParams.get("id")}`,
    }),
  );
  await context.route("**/api/background", async (route) => {
    await gate;
    background.push(route.request().method());
    await route.fulfill({ body: "done" });
  });
  try {
    const result = await page.evaluate(async () => {
      const outbound = Promise.all(
        ["a", "b", "c"].map(async (id) =>
          (await fetch(`/api/outbound?id=${id}`)).json(),
        ),
      );
      const echo = await fetch("/api/echo", {
        method: "POST",
        body: "日本語 🍷",
      });
      return {
        outbound: await outbound,
        echo: await echo.text(),
        header: echo.headers.get("x-runtime"),
        origin: location.origin,
      };
    });
    expect(result.echo).toBe("日本語 🍷");
    expect(result.header).toBe("local");
    expect(result.outbound).toEqual(
      ["a", "b", "c"].map((id) => ({
        upstream: `upstream:${id}`,
        url: `${result.origin}/api/outbound?id=${id}`,
        dom: false,
      })),
    );
    expect(background).toEqual([]); // Responses did not wait for background I/O.
    release();
    await page.evaluate(() => window.experiment.drain());
    expect(background).toEqual(["POST", "POST", "POST"]);
    expect(await page.evaluate(() => window.experiment.errors)).toEqual([]);
  } finally {
    release();
  }
});

test("transfers a live response stream and propagates reader cancellation", async ({
  page,
}) => {
  expect(
    await page.evaluate(async () => {
      const response = await fetch("/api/stream");
      const reader = response.body!.getReader();
      const first = await reader.read();
      await reader.cancel("consumer stopped");
      return new TextDecoder().decode(first.value);
    }),
  ).toBe("first");
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await (await fetch("/api/stats")).json()).cancelled,
      ),
    )
    .toBe(1);
});

test("forwards abort while the handler is pending", async ({ page }) => {
  await page.evaluate(() => {
    const controller = new AbortController();
    Object.assign(window, {
      abortExperiment: () => controller.abort(),
      pendingExperiment: fetch("/api/abort", {
        signal: controller.signal,
      }).then(
        () => "unexpected",
        (error) => error.name,
      ),
    });
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await (await fetch("/api/stats")).json()).active,
      ),
    )
    .toBe(1);
  const outcome = await page.evaluate(async () => {
    const state = window as unknown as {
      abortExperiment(): void;
      pendingExperiment: Promise<string>;
    };
    state.abortExperiment();
    return state.pendingExperiment;
  });
  expect(outcome).toBe("AbortError");
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await (await fetch("/api/stats")).json()).aborted,
      ),
    )
    .toBe(1);
});

test("transports handler errors and preserves local 404s", async ({ page }) => {
  expect(
    await page.evaluate(async () => {
      const error = await fetch("/api/failure").then(
        () => "unexpected",
        (error) => error.name,
      );
      return { error, status: (await fetch("/api/missing")).status };
    }),
  ).toEqual({ error: "TypeError", status: 404 });
});
