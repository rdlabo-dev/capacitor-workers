import { writeFile } from "node:fs/promises";
const framework = process.argv[2];
const tabs = await (await fetch("http://127.0.0.1:9227/json")).json();
const tab = tabs.find((t) => t.url.includes("/pages/"));
if (!tab) throw new Error("No document WebView");
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let serial = 0;
async function call(method, params) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CDP timeout")), 10000);
    const listener = (e) => {
      const r = JSON.parse(e.data);
      if (r.id === id) {
        clearTimeout(timeout);
        ws.removeEventListener("message", listener);
        r.error ? reject(r.error) : resolve(r.result);
      }
    };
    ws.addEventListener("message", listener);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
try {
  let state, report;
  for (let i = 0; i < 60; i++) {
    const value = await call("Runtime.evaluate", {
      expression:
        'JSON.stringify({url:location.href,report:localStorage.getItem("native-document-result"),visible:!!document.querySelector("#native-document-report")})',
      returnByValue: true,
    });
    state = JSON.parse(value.result.value);
    report = JSON.parse(state.report);
    if (state.visible && report) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (
    !state.visible ||
    report?.framework?.toLowerCase() !== framework ||
    !report.cases.every((c) => c.passed)
  )
    throw new Error(JSON.stringify(state));
  const prefix =
    new URL(
      process.argv.includes("--public-api")
        ? "../../artifacts/public-documents-"
        : "../../artifacts/plugin-documents-",
      import.meta.url,
    ).pathname +
    framework +
    "-android";
  await writeFile(prefix + ".json", JSON.stringify(report, null, 2));
  const shot = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(prefix + ".png", Buffer.from(shot.data, "base64"));
  if (report.cases.length !== 50) throw new Error("Expected 50 checks");
  console.log(framework + ": 50/50 native checks passed");
  if (process.argv.includes("--cleanup")) {
    const cleanup = await call("Runtime.evaluate", {
      expression:
        "navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister())))",
      awaitPromise: true,
      returnByValue: true,
    });
    if (cleanup.exceptionDetails)
      throw new Error("Service Worker cleanup failed");
  }
} finally {
  ws.close();
}
