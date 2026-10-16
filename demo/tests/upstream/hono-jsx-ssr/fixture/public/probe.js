// Test driver served as a bundled static asset and injected into upstream
// HTML responses by ../worker.ts. The upstream application is unchanged.
// "screen:" cases verify the rendered document; "fetch:" cases verify HTTP
// status/body through the local transport; "iframe:" verifies that a 404
// body renders as a document.
async function runUpstreamProbe() {
  const key = "upstream-probe";
  const state = JSON.parse(
    sessionStorage.getItem(key) || '{"step":0,"cases":[]}',
  );
  if (window.upstreamProbeStep === state.step) return;
  window.upstreamProbeStep = state.step;
  if (document.readyState !== "complete")
    await new Promise((resolve) =>
      window.addEventListener("load", resolve, { once: true }),
    );
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const save = () => sessionStorage.setItem(key, JSON.stringify(state));
  const record = (name, passed, error) => {
    state.cases.push({ name, passed, ...(error ? { error } : {}) });
    save();
  };
  const check = async (name, predicate) => {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(name);
      await new Promise((r) => setTimeout(r, 50));
    }
    record(name, true);
  };
  const next = (action) => {
    state.step++;
    save();
    action();
  };
  const report = () => {
    const result = { url: location.href, cases: state.cases };
    const output = document.createElement("pre");
    output.id = "upstream-report";
    output.style.cssText =
      "white-space:pre-wrap;font:12px/1.5 monospace;border:2px solid #333;padding:8px";
    output.textContent =
      `upstream hono-jsx-ssr: ${state.cases.filter((c) => c.passed).length}/${state.cases.length} passed\n` +
      state.cases
        .map(
          (c) =>
            `${c.passed ? "PASS" : "FAIL"} ${c.name}${c.error ? ": " + c.error : ""}`,
        )
        .join("\n");
    document.body.append(output);
    console.log("UPSTREAM_RESULT", JSON.stringify(result));
    // Final evidence: navigate the top level to a missing post. The upstream
    // 404 body is text/plain, so no script runs there; the runner captures
    // the rendered result in a screenshot after this report.
    setTimeout(() => location.assign("/post/99"), 2500);
  };
  try {
    if (state.step === 0) {
      await check("screen: top title", () => document.title === "Top");
      await check(
        "screen: header link",
        () =>
          document.querySelector("header h1 a")?.textContent ===
            "Hono Example" &&
          document.querySelector("header h1 a")?.getAttribute("href") === "/",
      );
      await check(
        "screen: five post links",
        () =>
          [...document.querySelectorAll("main a")]
            .map((a) => a.getAttribute("href"))
            .join(",") === "/post/1,/post/2,/post/3,/post/4,/post/5",
      );
      await check(
        "screen: UTF-8 post title in list",
        () =>
          document.querySelector('a[href="/post/5"]')?.textContent ===
          "こんにちは",
      );
      window.upstreamSentinel = true;
      next(() => document.querySelector('a[href="/post/1"]').click());
    } else if (state.step === 1) {
      await check(
        "screen: link opened fresh document",
        () => location.pathname === "/post/1" && !window.upstreamSentinel,
      );
      await check(
        "screen: detail title and body",
        () =>
          document.title === "Good Morning" &&
          document.querySelector("main h2")?.textContent === "Good Morning" &&
          document.querySelector("main p")?.textContent ===
            "Let us eat breakfast",
      );
      next(() => history.back());
    } else if (state.step === 2) {
      await check(
        "screen: back returns to top",
        () => location.pathname === "/" && document.title === "Top",
      );
      next(() => location.assign("/post/5"));
    } else if (state.step === 3) {
      await check(
        "screen: UTF-8 detail",
        () =>
          document.title === "こんにちは" &&
          document.querySelector("main h2")?.textContent === "こんにちは" &&
          document.querySelector("main p")?.textContent ===
            "昼からビールを飲みます" &&
          document.characterSet === "UTF-8",
      );
      const missing = await fetch("/post/99");
      record("fetch: missing post status", missing.status === 404);
      record(
        "fetch: missing post body",
        (await missing.text()).includes("404 Not Found"),
      );
      const invalid = await fetch("/post/abc");
      record("fetch: invalid route status", invalid.status === 404);
      record(
        "fetch: invalid route body",
        (await invalid.text()).includes("404 Not Found"),
      );
      const unknown = await fetch("/no-such-path");
      record("fetch: unknown path status", unknown.status === 404);
      const frame = document.createElement("iframe");
      frame.src = "/post/99";
      await new Promise((resolve, reject) => {
        frame.onload = resolve;
        frame.onerror = () => reject(new Error("iframe 404 load failed"));
        document.body.append(frame);
      });
      record(
        "iframe: 404 body renders as document",
        !!frame.contentDocument?.body?.innerText.includes("404 Not Found"),
      );
      state.step++;
      save();
      report();
    }
  } catch (error) {
    record(String(error), false);
    report();
  }
}
window.addEventListener("pageshow", (event) => {
  if (event.persisted) runUpstreamProbe();
});
runUpstreamProbe();
