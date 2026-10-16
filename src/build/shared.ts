import { fileURLToPath } from "node:url";

export const configuredPath = fileURLToPath(
  new URL("../configured.js", import.meta.url),
);
export const transportPath = fileURLToPath(
  new URL("../isolated/transport.js", import.meta.url),
);
export const compatPath = (name: string) =>
  fileURLToPath(new URL(`../compat/${name}.js`, import.meta.url));
export function compatibilityAliases() {
  return {
    "cloudflare:node": compatPath("cloudflare-node"),
    "cloudflare:workers": compatPath("cloudflare-workers"),
    "node:async_hooks": compatPath("async-hooks"),
    async_hooks: compatPath("async-hooks"),
    "node:http": compatPath("http"),
    http: compatPath("http"),
  };
}
export function workerEntry(entry: string) {
  return `import worker from ${JSON.stringify(entry)};\nimport { serve } from ${JSON.stringify(transportPath)};\nserve(worker);`;
}
export function workerSource(entry: string, factoryImport: string) {
  return `import createWorker from ${JSON.stringify(factoryImport)};\nexport default { createWorker, loadDirect: async () => (await import(${JSON.stringify(entry)})).default };`;
}
