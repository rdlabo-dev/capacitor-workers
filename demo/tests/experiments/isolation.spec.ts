import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page, context }, testInfo) => {
  if (testInfo.title.includes("startup failure")) {
    await context.route("**/assets/worker-*.js", (route) => route.abort());
  }
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
  await context.route("**/api/upstream.txt?*", (route) =>
    route.fulfill({
      body: `upstream:${new URL(route.request().url()).searchParams.get("id")}`,
    }),
  );
  await context.route("**/api/background.txt", async (route) => {
    await gate;
    background.push(route.request().method());
    await route.fulfill({ body: "background completed" });
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

test("remembers startup failure before the first request and never blocks drain", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const startup = await window.experiment.ready.then(
      () => false,
      () => true,
    );
    const rejected: boolean[] = [];
    for (let i = 0; i < 2; i++) {
      rejected.push(
        await fetch("/api/echo").then(
          () => false,
          () => true,
        ),
      );
    }
    await window.experiment.drain();
    return { startup, rejected, active: window.experiment.activeCalls };
  });
  expect(result).toEqual({ startup: true, rejected: [true, true], active: 0 });
});

test("preserves statusText and releases completed calls without disposing the worker", async ({
  page,
}) => {
  expect(
    await page.evaluate(async () => {
      for (let i = 0; i < 30; i++) {
        const response = await fetch("/api/status");
        if (
          response.status !== 202 ||
          response.statusText !== "Queued" ||
          (await response.text()) !== "ok"
        )
          return false;
      }
      await window.experiment.drain();
      return true;
    }),
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.experiment.activeCalls))
    .toBe(0);
});

test("aborting after headers errors the body and releases the source reader", async ({
  page,
}) => {
  expect(
    await page.evaluate(async () => {
      const controller = new AbortController();
      const reader = (
        await fetch("/api/stream", { signal: controller.signal })
      ).body!.getReader();
      await reader.read();
      const pending = reader.read().then(
        () => "unexpected",
        (error) => error.name,
      );
      controller.abort();
      return pending;
    }),
  ).toBe("AbortError");
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await (await fetch("/api/stats")).json()).cancelled,
      ),
    )
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.experiment.activeCalls))
    .toBe(0);
});

test("preserves a null abort reason after headers", async ({ page }) => {
  expect(
    await page.evaluate(async () => {
      const controller = new AbortController();
      const reader = (
        await fetch("/api/stream", { signal: controller.signal })
      ).body!.getReader();
      await reader.read();
      const pending = reader.read().then(
        () => "unexpected",
        (error) => error,
      );
      controller.abort(null);
      return pending;
    }),
  ).toBeNull();
});

test("rejects cancellation when the source cancel fails", async ({ page }) => {
  expect(
    await page.evaluate(async () => {
      const reader = (await fetch("/api/cancel-failure")).body!.getReader();
      // Also exercise cancellation while a pull is pending.
      const pending = reader.read();
      const result = await reader.cancel().then(
        () => "unexpected",
        (error) => error.message,
      );
      await pending;
      return result;
    }),
  ).toContain("expected cancellation failure");
  await expect
    .poll(() => page.evaluate(() => window.experiment.activeCalls))
    .toBe(0);
});
