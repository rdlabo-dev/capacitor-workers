import { readFile, writeFile, unlink, copyFile } from "node:fs/promises";
const demo = new URL("../../", import.meta.url);
const repo = new URL("../../../", import.meta.url);
const scene = new URL("ios/App/App/SceneDelegate.swift", demo);
const backup = new URL("artifacts/public-document-original.swift", demo);
if (process.argv[2] === "apply") {
  const original = await readFile(scene, "utf8");
  if (
    !original.includes("window?.rootViewController = CAPBridgeViewController()")
  )
    throw Error("Expected ordinary controller");
  await writeFile(backup, original, { flag: "wx" });
  let native = await readFile(
    new URL("native/ios/DocumentBridge.swift", repo),
    "utf8",
  );
  // Inject the existing acceptance driver without adding diagnostics to production.
  native = native.replace(
    "        return super.webView(with: frame, configuration: actual)",
    `
        let testProbe = PublicDocumentProbe()
        actual.userContentController.addScriptMessageHandler(testProbe, contentWorld: .page, name: "publicDocumentProbe")
        if let path = Bundle.main.path(forResource: "probe", ofType: "js", inDirectory: "public"), let probe = try? String(contentsOfFile: path, encoding: .utf8) {
            actual.userContentController.addUserScript(WKUserScript(source: probe, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let page = super.webView(with: frame, configuration: actual)
        testProbe.page = page
        return page`,
  );
  native = native.replace(
    "        actual.userContentController.addUserScript(WKUserScript(source: script,",
    '        actual.userContentController.addUserScript(WKUserScript(source: "window.documentNativeFetch = window.fetch.bind(window);", injectionTime: .atDocumentStart, forMainFrameOnly: true))\n        actual.userContentController.addUserScript(WKUserScript(source: script,',
  );
  const plugin = await readFile(
    new URL("native/ios/CapacitorWorkersPlugin.swift", repo),
    "utf8",
  );
  const probe = await readFile(
    new URL("../native/connection/PublicDocumentProbe.swift", import.meta.url),
    "utf8",
  );
  await writeFile(
    scene,
    original.replace(
      "window?.rootViewController = CAPBridgeViewController()",
      `let controller = CAPBridgeViewController()
        window?.rootViewController = controller
        controller.loadViewIfNeeded()
        controller.bridge?.registerPluginInstance(CapacitorWorkersPlugin())
        controller.webView?.reload()`,
    ) +
      "\n" +
      native +
      "\n" +
      plugin +
      "\n" +
      probe,
  );
} else if (process.argv[2] === "restore") {
  await writeFile(scene, await readFile(backup));
  await unlink(backup);
} else throw Error("Usage: public-document-overlay.mjs apply|restore");
