import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  EncodingImplementation,
  encodingContract,
} from "../../../../../src/compat/encoding/index.spec";
import {
  AbortImplementation,
  abortContract,
} from "../../../../../src/compat/abort/index.spec";
export default {
  async fetch() {
    return Response.json(
      await Promise.all([
        runContract(new EncodingImplementation(), encodingContract),
        runContract(
          new AbortImplementation({
            AbortController,
            AbortSignal,
          }),
          abortContract,
        ),
      ]),
    );
  },
};
