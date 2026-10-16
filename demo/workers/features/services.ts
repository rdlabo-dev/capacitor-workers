import kvWorker from "./kv";
import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  textContract,
  wasmContract,
  type TextStore,
} from "../../features/contracts";
import { WorkersText, WasmValidation } from "../../features/implementations";
export default {
  async fetch(_request: Request, env: { TEXT: TextStore }) {
    if (new URL(_request.url).pathname === "/kv")
      return kvWorker.fetch(_request, { KV: env.TEXT });
    return Response.json([
      await runContract(new WorkersText(env.TEXT), textContract),
      await runContract(new WasmValidation(), wasmContract),
    ]);
  },
};
