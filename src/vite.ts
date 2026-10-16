import { fileURLToPath } from "node:url";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import type { PluginOption } from "vite";

/** Add only to the Capacitor/browser build, never the Cloudflare build. */
export function capacitorWorkersPlugin(): PluginOption[] {
  const compat = (name: string) =>
    fileURLToPath(new URL(`./compat/${name}.js`, import.meta.url));
  return [
    {
      name: "capacitor-workers",
      config: () => ({
        resolve: {
          alias: {
            "cloudflare:node": compat("cloudflare-node"),
            "cloudflare:workers": compat("cloudflare-workers"),
            "node:async_hooks": compat("async-hooks"),
            async_hooks: compat("async-hooks"),
          },
        },
      }),
    },
    ...nodePolyfills({ overrides: { http: compat("http") } }),
  ];
}
