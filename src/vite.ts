import { resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  configuredPath,
  compatibilityAliases,
  workerEntry,
  workerSource,
  compatPath,
} from "./build/shared.js";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import type { Plugin, PluginOption } from "vite";
import { normalizePath } from "vite";

/** Add only to the Capacitor/browser build, never the Cloudflare build. */
function compatibilityPlugins(): PluginOption[] {
  return [
    {
      name: "capacitor-workers",
      config: () => ({
        // Express and cloudflare:node must share one prebundled HTTP registry.
        optimizeDeps: { include: ["cloudflare:node"] },
        resolve: {
          alias: compatibilityAliases(),
        },
      }),
    },
    ...nodePolyfills({ overrides: { http: compatPath("http") } }),
  ];
}

// A real-looking absolute ID survives Vite's worker query stripping without
// writing generated entry files into the consumer's project.
const entrySuffix = ".capacitor-worker.js";
function workerEntryPlugin(entries: Map<string, string>): Plugin {
  return {
    name: "capacitor-workers-entry",
    enforce: "pre",
    async resolveId(source, importer) {
      const [path, query = ""] = source.split("?");
      if (entries.has(path)) return source;
      if (query !== "capacitor-worker") return;
      const resolved = await this.resolve(path, importer, { skipSelf: true });
      if (!resolved || resolved.external)
        this.error("Cannot resolve Worker entry: " + path);
      const generated = resolved.id + entrySuffix;
      if (existsSync(generated))
        this.error(
          "Generated Worker entry conflicts with an existing file: " +
            generated,
        );
      entries.set(generated, resolved.id);
      return resolved.id + "?capacitor-worker";
    },
    load(id) {
      const [path, query = ""] = id.split("?");
      if (query === "capacitor-worker") {
        return `import Constructor from ${JSON.stringify(path + entrySuffix + "?worker")};
export default () => new Constructor();`;
      }
      if (entries.has(path) && !new URLSearchParams(query).has("worker")) {
        const original = entries.get(path)!;
        return workerEntry(original);
      }
    },
  };
}

/** Add only to the Capacitor/browser build, never the Cloudflare build. */
export interface CapacitorWorkersPluginOptions {
  /** Workers application entry, relative to Vite root or an absolute path. */
  worker?: string;
}
export function capacitorWorkersPlugin(
  options: CapacitorWorkersPluginOptions = {},
): PluginOption[] {
  const entries = new Map<string, string>();
  let root: string;
  return [
    {
      name: "capacitor-workers-source",
      enforce: "pre",
      config: () => ({
        optimizeDeps: { exclude: ["@rdlabo/capacitor-workers"] },
      }),
      configResolved(config) {
        root = config.root;
      },
      resolveId(id) {
        if (id === "virtual:capacitor-workers")
          return "\0virtual:capacitor-workers";
      },
      load(id) {
        const configured = id.split("?")[0] === normalizePath(configuredPath);
        if (!configured && id !== "\0virtual:capacitor-workers") return;
        if (configured && !options.worker) return;
        if (!options.worker)
          this.error(
            "Set worker in capacitorWorkersPlugin({ worker }) before importing virtual:capacitor-workers.",
          );
        const entry = resolve(root, options.worker);
        return workerSource(entry, entry + "?capacitor-worker");
      },
    },
    workerEntryPlugin(entries),
    {
      name: "capacitor-workers-worker-build",
      config(config) {
        const previous = config.worker?.plugins;
        return {
          worker: {
            plugins: () => [
              ...(previous?.() ?? []),
              workerEntryPlugin(entries),
              ...compatibilityPlugins(),
            ],
          },
        };
      },
    },
    ...compatibilityPlugins(),
  ];
}
