import kvWorker from "./kv";
import { runContract } from "@rdlabo/capacitor-workers/testing";
import { kvTextContract } from "@rdlabo/capacitor-workers/testing/kv";
import type { KVTextNamespace } from "@rdlabo/capacitor-workers/features/kv";
import { wasmContract } from "../../features/contracts";
import { WorkersText, WasmValidation } from "../../features/implementations";
export default {
  async fetch(_request: Request, env: { TEXT: KVTextNamespace }) {
    if (new URL(_request.url).pathname === "/kv")
      return kvWorker.fetch(_request, { KV: env.TEXT });
    return Response.json([
      await runContract(new WorkersText(env.TEXT), kvTextContract),
      await runContract(new WasmValidation(), wasmContract),
    ]);
  },
};
