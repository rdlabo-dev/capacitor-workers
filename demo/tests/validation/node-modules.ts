// Environment runners share module-owned contracts. The node:* imports in
// their implementations resolve to workerd builtins or the bundler aliases.
import {
  runContract,
  type ContractResult,
} from "@rdlabo/capacitor-workers/testing";
import { nodePathContract } from "../../../src/compat/path/tests/contract";
import {
  BundledPath,
  WorkersPath,
} from "../../../src/compat/path/tests/implementation";
import { nodeQuerystringContract } from "../../../src/compat/querystring/tests/contract";
import { NodeQuerystring } from "../../../src/compat/querystring/tests/implementation";
import { nodeStringDecoderContract } from "../../../src/compat/string-decoder/tests/contract";
import { NodeStringDecoder } from "../../../src/compat/string-decoder/tests/implementation";

export type NodeProfile = "bundled" | "workers";

export async function runNodeContracts(
  profile: NodeProfile = "bundled",
): Promise<ContractResult[]> {
  return [
    await runContract(
      profile === "workers" ? new WorkersPath() : new BundledPath(),
      nodePathContract,
    ),
    await runContract(new NodeQuerystring(), nodeQuerystringContract),
    await runContract(new NodeStringDecoder(), nodeStringDecoderContract),
  ];
}
