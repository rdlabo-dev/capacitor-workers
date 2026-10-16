import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
const file = new URL("ios/App/App/SceneDelegate.swift", root);
const backup = new URL("artifacts/connection-original.swift", root);
if (process.argv[2] === "apply") {
  const original = await readFile(file, "utf8");
  if (
    !original.includes("window?.rootViewController = CAPBridgeViewController()")
  )
    throw Error("Expected ordinary Capacitor controller");
  await mkdir(new URL("artifacts/", root), { recursive: true });
  await writeFile(backup, original, { flag: "wx" });
  const probe = await readFile(
    new URL("../native/connection/ConnectionProbe.swift", import.meta.url),
    "utf8",
  );
  await writeFile(
    file,
    original.replace(
      "window?.rootViewController = CAPBridgeViewController()",
      `let controller = CAPBridgeViewController()
        window?.rootViewController = controller
        controller.loadViewIfNeeded()
        controller.bridge?.registerPluginInstance(ConnectionProbePlugin())`,
    ) +
      "\n" +
      probe,
  );
} else if (process.argv[2] === "restore") {
  await writeFile(file, await readFile(backup));
  await unlink(backup);
} else throw Error("Usage: native-connection-overlay.mjs apply|restore");
