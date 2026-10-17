import { fileURLToPath } from "node:url";

export const configuredPath = fileURLToPath(
  new URL("../configured.js", import.meta.url),
);
export const transportPath = fileURLToPath(
  new URL("../isolated/transport.js", import.meta.url),
);
export const compatPath = (name: string) =>
  fileURLToPath(new URL(`../compat/${name}/index.js`, import.meta.url));
// A compat module reusing a CommonJS polyfill imports the concrete package
// file; the bare name is the alias target, so only the deep specifier can
// reach the real implementation without recursing.
const polyfill = (specifier: string) =>
  fileURLToPath(import.meta.resolve(specifier));
export function compatibilityAliases() {
  return {
    "cloudflare:node": compatPath("cloudflare-node"),
    "cloudflare:workers": compatPath("cloudflare-workers"),
    "node:async_hooks": compatPath("async-hooks"),
    async_hooks: compatPath("async-hooks"),
    "node:http": compatPath("http"),
    http: compatPath("http"),
    // Subpath aliases must precede their parents: object-form alias entries
    // also match an "<alias>/" prefix.
    "node:path/posix": compatPath("path/posix"),
    "path/posix": compatPath("path/posix"),
    "node:path": compatPath("path"),
    path: compatPath("path"),
    "node:querystring": compatPath("querystring"),
    querystring: compatPath("querystring"),
    "string_decoder/lib/string_decoder.js": polyfill(
      "string_decoder/lib/string_decoder.js",
    ),
    "node:string_decoder": compatPath("string-decoder"),
    string_decoder: compatPath("string-decoder"),
  };
}
export function workerEntry(entry: string) {
  return `import worker from ${JSON.stringify(entry)};\nimport { serve } from ${JSON.stringify(transportPath)};\nserve(worker);`;
}
export function workerSource(entry: string, factoryImport: string) {
  return `import createWorker from ${JSON.stringify(factoryImport)};\nexport default { createWorker, loadDirect: async () => (await import(${JSON.stringify(entry)})).default };`;
}
