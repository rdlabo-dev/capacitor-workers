import { test, expect } from "@playwright/test";
for (const mode of ["default", "direct", "unavailable", "binding"] as const) {
  test(`configured entry selects ${mode} before dispatch`, async ({ page }) => {
    if (mode === "unavailable")
      await page.addInitScript(() =>
        Object.defineProperty(globalThis, "Worker", { value: undefined }),
      );
    await page.goto("/");
    await page.waitForFunction(
      () => typeof window.startPreferred === "function",
    );
    const result = await page.evaluate(async (mode) => {
      const runtime = window.startPreferred(
        mode === "direct" ? "direct" : undefined,
        mode === "binding"
          ? {
              KV: {
                get() {
                  return "value";
                },
              },
            }
          : {},
      );
      try {
        await runtime.ready;
        const response = await fetch("/api/echo", {
          method: "POST",
          body: "preference 🍷",
        });
        return { execution: runtime.execution, text: await response.text() };
      } finally {
        runtime.dispose();
      }
    }, mode);
    expect(result).toEqual({
      execution: mode === "default" ? "worker" : "direct",
      text: "preference 🍷",
    });
  });
}
