import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const file = new URL("ios/App/App/SceneDelegate.swift", root);
const backup = new URL("artifacts/plugin-document-original.swift", root);
if (process.argv[2] === "apply") {
  const original = await readFile(file, "utf8");
  if (
    !original.includes("window?.rootViewController = CAPBridgeViewController()")
  )
    throw Error("Expected ordinary controller");
  await mkdir(new URL("artifacts/", root), { recursive: true });
  await writeFile(backup, original, { flag: "wx" });
  let documents = await readFile(
    new URL("../native/documents/DocumentBridge.swift", import.meta.url),
    "utf8",
  );
  documents = documents
    .replace(
      "private var documents: DocumentSchemeHandler?",
      "var runtimeHost: WKWebView!\n    private var documents: DocumentSchemeHandler?",
    )
    .replace(
      "DocumentSchemeHandler(assets: assets)",
      "DocumentSchemeHandler(assets: assets, runtimeHost: runtimeHost)",
    )
    .replace(
      "init(assets: WKURLSchemeHandler)",
      "init(assets: WKURLSchemeHandler, runtimeHost: WKWebView)",
    )
    .replace(
      'let config = WKWebViewConfiguration()\n        config.setURLSchemeHandler(assets, forURLScheme: "capacitor")',
      "let config = runtimeHost.configuration",
    )
    .replace(
      "runtime = WKWebView(frame: .zero, configuration: config)",
      "runtime = runtimeHost",
    );
  const plugin = await readFile(
    new URL(
      "../native/connection/DocumentConnectionPlugin.swift",
      import.meta.url,
    ),
    "utf8",
  );
  await writeFile(
    file,
    original.replace(
      "window?.rootViewController = CAPBridgeViewController()",
      `let controller = CAPBridgeViewController()
        window?.rootViewController = controller
        controller.loadViewIfNeeded()
        controller.bridge?.registerPluginInstance(DocumentConnectionPlugin())
        controller.webView?.reload()`,
    ) +
      "\n" +
      plugin +
      "\n" +
      documents,
  );
} else if (process.argv[2] === "restore") {
  await writeFile(file, await readFile(backup));
  await unlink(backup);
} else throw Error("Usage: native-plugin-document-overlay.mjs apply|restore");
