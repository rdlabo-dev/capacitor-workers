import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  textContract,
  wasmContract,
  type TextStore,
} from "../../features/contracts";
import { WorkersText, WasmValidation } from "../../features/implementations";
export default {
  async fetch(_request: Request, env: { TEXT: TextStore }) {
    return Response.json([
      await runContract(new WorkersText(env.TEXT), textContract),
      await runContract(new WasmValidation(), wasmContract),
    ]);
  },
};
