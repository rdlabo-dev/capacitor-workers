// esbuild injects these imports only where a Node global is referenced.
export { Buffer } from "node:buffer";
export { default as process } from "node:process";
export const global = globalThis;
