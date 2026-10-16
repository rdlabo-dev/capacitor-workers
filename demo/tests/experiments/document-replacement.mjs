// Isolated feasibility probe. This is not the public rendering implementation.
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    await page.route("http://localhost/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/module.js")
        return route.fulfill({
          contentType: "text/javascript",
          body: "window.moduleRuns = (window.moduleRuns || 0) + 1;",
        });
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Bootstrap</title><body>Bootstrap</body>",
      });
    });
    await page.goto("http://localhost/");
    const replace = () => {
      window.originalWindow ??= window;
      document.open();
      document.write(
        '<!doctype html><title>Worker HTML</title><body><h1>Rendered</h1><script>window.classicRuns = (window.classicRuns || 0) + 1;</script><script type="module" src="/module.js"></script></body>',
      );
      document.close();
    };
    await page.evaluate(replace);
    await page.waitForFunction(() => window.moduleRuns === 1);
    await page.evaluate(() => history.pushState(null, "", "/second"));
    await page.evaluate(replace);
    await page.waitForLoadState("load");
    const result = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      sameWindow: window === window.originalWindow,
      classicRuns: window.classicRuns,
      moduleRuns: window.moduleRuns,
    }));
    assert.deepEqual(result, {
      url: "http://localhost/second",
      title: "Worker HTML",
      sameWindow: true,
      classicRuns: 2,
      moduleRuns: 1,
    });
    console.log(JSON.stringify({ browser: name, ...result }));
  } finally {
    await browser.close();
  }
}
