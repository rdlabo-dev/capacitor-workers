import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const probe = readFileSync(
  new URL("./fixture/public/probe.js", import.meta.url),
  "utf8",
);

for (const scenario of [
  {
    name: "completed previous run",
    runId: "previous",
    step: 4,
    next: "/post/1",
    count: 4,
  },
  {
    name: "interrupted previous run",
    runId: "previous",
    step: 1,
    next: "/post/1",
    count: 4,
  },
  {
    name: "navigation within current run",
    runId: "current",
    step: 2,
    next: "/post/5",
    count: 2,
  },
]) {
  test(`probe resumes correctly: ${scenario.name}`, async ({ page }) => {
    await page.addInitScript(
      (saved) => {
        if (!sessionStorage.getItem("upstream-probe")) {
          sessionStorage.setItem("upstream-probe", JSON.stringify(saved));
        }
      },
      {
        runId: scenario.runId,
        step: scenario.step,
        cases: [{ name: "previous case", passed: true }],
      },
    );
    await page.route("**/*", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/probe-run.json") {
        await route.fulfill({ json: { runId: "current" } });
      } else if (path === "/probe.js") {
        await route.fulfill({ contentType: "text/javascript", body: probe });
      } else {
        await route.fulfill({
          contentType: "text/html",
          body:
            path === "/"
              ? `
          <html><head><title>Top</title></head><body>
          <header><h1><a href="/">Hono Example</a></h1></header>
          <main>${[1, 2, 3, 4, 5].map((id) => `<a href="/post/${id}">${id === 5 ? "こんにちは" : id}</a>`).join("")}</main>
          <script src="/probe.js" defer></script></body></html>`
              : "<p>Destination</p>",
        });
      }
    });
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`${scenario.next}$`));
    const state = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("upstream-probe")!),
    );
    expect(state.runId).toBe("current");
    expect(state.cases).toHaveLength(scenario.count);
    expect(
      state.cases.every((entry: { passed: boolean }) => entry.passed),
    ).toBe(true);
    expect(state.step).toBe(scenario.runId === "current" ? 3 : 1);
  });
}
