import {
  capacitorWorkers,
  type ExecutionPreference,
} from "@rdlabo/capacitor-workers";
import { runContract } from "../../../validation/contracts/http";
import { runNodeContracts } from "../../../validation/node-modules";
// Bare, node:-prefixed, subpath, named and default import forms must all
// resolve to the same compat profiles under both bundlers.
import nodePath from "node:path";
import barePath from "path";
import posixPath from "node:path/posix";
import { join as namedJoin } from "path";
import * as nodeQs from "node:querystring";
import nodeQsDefault from "node:querystring";
import bareQs from "querystring";
import { StringDecoder } from "node:string_decoder";
import bareStringDecoder from "string_decoder";

function resolved() {
  return [
    nodePath === barePath,
    namedJoin === nodePath.join,
    nodePath.join("a", "b") === "a/b",
    posixPath === nodePath.posix,
    nodeQs.parse === bareQs.parse,
    nodeQsDefault.stringify === bareQs.stringify,
    StringDecoder === bareStringDecoder.StringDecoder,
    new StringDecoder().write(new Uint8Array([0x61])) === "a",
  ];
}

async function run(prefer: ExecutionPreference) {
  // Both build integrations provide the configured entry; no special import.
  const runtime = capacitorWorkers({
    baseURL: "https://worker.invalid/api",
    prefer,
  });
  try {
    await runtime.ready;
    return {
      execution: runtime.execution,
      cases: await runContract(fetch),
      resolved: resolved(),
      node: { direct: await runNodeContracts("bundled") },
    };
  } finally {
    runtime.dispose();
  }
}
declare global {
  interface Window {
    runBuildTool: typeof run;
  }
}
window.runBuildTool = run;
