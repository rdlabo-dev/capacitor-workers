import { expect, it } from "vitest";
import type { Plugin } from "vite";
import { capacitorWorkersPlugin } from "../../src/vite";

it("does not transform ordinary files sharing the generated-entry suffix", () => {
  const plugin = capacitorWorkersPlugin().find(
    (plugin) => (plugin as Plugin).name === "capacitor-workers-entry",
  ) as Plugin;
  const load = plugin.load as (id: string) => unknown;
  expect(load("/app/example.capacitor-worker.js")).toBeUndefined();
  expect(
    load("/app/example.capacitor-worker.js?worker_file&type=module"),
  ).toBeUndefined();
});
