import { execFileSync } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const [app, ...extra] = process.argv.slice(2);
if (extra.length || (app !== "validation" && app !== "runtime")) {
  throw new Error("Usage: npm run test:native:prepare -- validation|runtime");
}

const demo = new URL("../../", import.meta.url);
execFileSync("npm", ["run", `build:${app}`], {
  cwd: fileURLToPath(demo),
  stdio: "inherit",
});
const source = new URL(
  app === "runtime" ? "artifacts/dedicated-worker/" : "artifacts/validation/",
  demo,
);
const destination = new URL("dist/", demo);
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
console.log(
  `Prepared ${app} in demo/dist. Run npm run sync, then npm run ios or android.`,
);
