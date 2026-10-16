import { readFile, writeFile, unlink, mkdir, copyFile } from "node:fs/promises";
const demo = new URL("../../", import.meta.url);
const repo = new URL("../../../", import.meta.url);
const registration = new URL(
  "android/app/src/main/assets/capacitor.plugins.json",
  demo,
);
const backup = new URL(
  "artifacts/android-public-document-registration.json",
  demo,
);
const javaRoot = new URL(
  "android/app/src/main/java/jp/rdlabo/capacitorworkers/",
  demo,
);
const files = [
  new URL("CapacitorWorkersPlugin.java", javaRoot),
  new URL("poc/PublicDocumentProbePlugin.java", javaRoot),
];
if (process.argv[2] === "apply") {
  const original = await readFile(registration, "utf8");
  await writeFile(backup, original, { flag: "wx" });
  await mkdir(javaRoot, { recursive: true });
  await copyFile(
    new URL("native/android/CapacitorWorkersPlugin.java", repo),
    files[0],
  );
  await copyFile(
    new URL(
      "../native/connection/PublicDocumentProbePlugin.java",
      import.meta.url,
    ),
    files[1],
  );
  await writeFile(
    registration,
    JSON.stringify([
      ...JSON.parse(original),
      {
        pkg: "capacitor-workers-source",
        classpath: "jp.rdlabo.capacitorworkers.CapacitorWorkersPlugin",
      },
      {
        pkg: "test-only",
        classpath: "jp.rdlabo.capacitorworkers.poc.PublicDocumentProbePlugin",
      },
    ]),
  );
} else if (process.argv[2] === "restore") {
  await writeFile(registration, await readFile(backup));
  for (const file of files) await unlink(file);
  await unlink(backup);
} else
  throw Error(
    "Usage: android-public-document-overlay.mjs apply|restore (after cap copy android)",
  );
