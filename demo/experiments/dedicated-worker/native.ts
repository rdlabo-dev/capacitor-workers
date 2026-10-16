import { Capacitor } from "@capacitor/core";

type Result = { name: string; ok: boolean; error?: string };
const results: Result[] = [];
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 3000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Observation timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function runNativeExperiment() {
  const upstream = `${location.protocol}//${location.host}`;
  const tests: [string, () => Promise<void>][] = [
    [
      "ReadableStream transfer capability",
      async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.close();
          },
        });
        const transferred = structuredClone(stream, { transfer: [stream] });
        equal((await transferred.getReader().read()).done, true);
      },
    ],
    [
      "outbound fetch + concurrent request + waitUntil",
      async () => {
        const outgoing = Promise.all(
          ["a", "b", "c"].map(async (id) =>
            (await fetch(`/api/outbound?id=${id}`)).json(),
          ),
        );
        const [values, echo] = await Promise.all([
          outgoing,
          fetch("/api/echo", { method: "POST", body: "日本語 🍷" }).then(
            (response) => response.text(),
          ),
        ]);
        equal(echo, "日本語 🍷");
        equal(
          values,
          ["a", "b", "c"].map((id) => ({
            upstream: "native upstream",
            url: `https://worker.invalid/api/outbound?id=${id}`,
            dom: false,
          })),
        );
        await window.experiment.drain();
        equal(window.experiment.errors, []);
      },
    ],
    [
      "stream transfer + source cancellation",
      async () => {
        const reader = (await fetch("/api/stream")).body!.getReader();
        equal(new TextDecoder().decode((await reader.read()).value), "first");
        await reader.cancel();
        await until(
          async () =>
            (await (await fetch("/api/stats")).json()).cancelled === 1,
        );
      },
    ],
    [
      "abort reaches the pending handler",
      async () => {
        const controller = new AbortController();
        const pending = fetch("/api/abort", { signal: controller.signal }).then(
          () => "unexpected",
          (error) => error.name,
        );
        await until(
          async () => (await (await fetch("/api/stats")).json()).active === 1,
        );
        controller.abort();
        equal(await pending, "AbortError");
        await until(
          async () => (await (await fetch("/api/stats")).json()).aborted === 1,
        );
      },
    ],
    [
      "handler error + local 404",
      async () => {
        equal(
          await fetch("/api/failure").then(
            () => "unexpected",
            (error) => error.name,
          ),
          "TypeError",
        );
        equal((await fetch("/api/missing")).status, 404);
      },
    ],
  ];
  for (const [name, run] of tests) {
    let runtime: ReturnType<typeof window.startExperiment> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      runtime = window.startExperiment(upstream, "https://worker.invalid/api");
      window.experiment = runtime;
      await Promise.race([
        run(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Experiment timed out")),
            8000,
          );
        }),
      ]);
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: String(error) });
    } finally {
      clearTimeout(timer);
      runtime?.dispose();
    }
  }
  const report = {
    platform: Capacitor.getPlatform(),
    url: location.href,
    userAgent: navigator.userAgent,
    results,
  };
  document.body.innerHTML = "<h1></h1><pre></pre>";
  document.querySelector("h1")!.textContent =
    `${results.every((r) => r.ok) ? "PASS" : "FAIL"} ${results.filter((r) => r.ok).length}/${results.length}`;
  document.querySelector("pre")!.textContent = JSON.stringify(report, null, 2);
  console.log("NATIVE_EXPERIMENT", JSON.stringify(report));
}
