import { execFileSync, spawn } from "node:child_process";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
const [platform, framework, device] = process.argv.slice(2);
if (
  !["ios", "android"].includes(platform) ||
  !["hono", "express"].includes(framework) ||
  !device
)
  throw Error(
    "Usage: run-native-package.mjs ios|android hono|express <simulator UUID|emulator serial>",
  );
const { consumer } = JSON.parse(
  await readFile(
    new URL("../../artifacts/native-package-consumer.json", import.meta.url),
    "utf8",
  ),
);
const output = join(consumer, "artifacts");
await mkdir(output, { recursive: true });
const appId = "jp.rdlabo.capacitorworkers.packaged";
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: consumer,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
run("npm", ["run", "build", "--", "--mode", framework]);
run("npx", ["cap", "sync", platform]);
const buildLog = await open(
  join(output, `${platform}-${framework}-build.log`),
  "w",
);
let child;
try {
  if (platform === "ios") {
    run(
      "xcodebuild",
      [
        "-project",
        "ios/App/App.xcodeproj",
        "-scheme",
        "App",
        "-configuration",
        "Debug",
        "-sdk",
        "iphonesimulator",
        "-destination",
        `id=${device}`,
        "-derivedDataPath",
        join(output, "ios"),
        "-skipPackageUpdates",
        "CODE_SIGNING_ALLOWED=NO",
        "build",
      ],
      { stdio: ["ignore", buildLog.fd, buildLog.fd] },
    );
    run("xcrun", [
      "simctl",
      "install",
      device,
      join(output, "ios/Build/Products/Debug-iphonesimulator/App.app"),
    ]);
    child = spawn(
      "xcrun",
      [
        "simctl",
        "launch",
        "--console-pty",
        "--terminate-running-process",
        device,
        appId,
      ],
      { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] },
    );
  } else {
    // Android's ordinary Gradle/SDK environment is supplied by the developer.
    run("./gradlew", ["clean", ":app:assembleDebug"], {
      cwd: join(consumer, "android"),
      stdio: ["ignore", buildLog.fd, buildLog.fd],
    });
    const adb = process.env.ADB ?? "adb";
    const args = [
      ...(process.env.ADB_SERVER_PORT
        ? ["-P", process.env.ADB_SERVER_PORT]
        : []),
      "-s",
      device,
    ];
    run(adb, [
      ...args,
      "install",
      "-r",
      join(consumer, "android/app/build/outputs/apk/debug/app-debug.apk"),
    ]);
    run(adb, [...args, "shell", "am", "force-stop", appId]);
    run(adb, [...args, "shell", "am", "start", "-n", appId + "/.MainActivity"]);
    let pid;
    for (let i = 0; i < 30 && !pid; i++) {
      try {
        pid = run(adb, [...args, "shell", "pidof", appId]).trim();
      } catch {}
      if (!pid) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(pid, "Android app did not launch");
    child = spawn(
      adb,
      [...args, "logcat", "--pid=" + pid, "-T", "1", "-v", "raw"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  }
  let log = "";
  let report;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Error("Native package acceptance timed out"));
    }, 120000);
    const receive = (chunk) => {
      log += chunk.toString();
      const match = log.match(/PACKAGED_RESULT (\{[^\r\n]+\})/);
      if (match) {
        try {
          report = JSON.parse(match[1]);
        } catch {}
        if (report?.failed.length) {
          clearTimeout(timer);
          reject(Error(JSON.stringify(report)));
        }
        if (report && log.includes("PACKAGED_STOP")) {
          clearTimeout(timer);
          resolve();
        }
      }
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(Error("Native console exited: " + code));
    });
  }).finally(
    async () =>
      await writeFile(
        join(output, `${platform}-${framework}-console.log`),
        log,
      ),
  );
  assert.equal(report.framework.toLowerCase(), framework);
  assert.equal(report.total, 50);
  assert.deepEqual(report.failed, []);
  await writeFile(
    join(output, `${platform}-${framework}.json`),
    JSON.stringify({ ...report, stop: true }, null, 2),
  );
  console.log(
    `${platform}/${framework}: ${report.total}/${report.total}, stop passed (packed install, no native overlays)`,
  );
} finally {
  child?.kill("SIGTERM");
  await buildLog.close();
}
