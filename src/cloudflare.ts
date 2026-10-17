/** Opt-in types for the Cloudflare API implemented by the browser adapter. */
declare module "cloudflare:node" {
  export const handleAsNodeRequest: typeof import("./compat/cloudflare-node/index.js").handleAsNodeRequest;
  export const httpServerHandler: typeof import("./compat/cloudflare-node/index.js").httpServerHandler;
}
