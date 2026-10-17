// Imports resolve through each environment's own module machinery: the
// bundlers' compatibility aliases in browser/Worker builds, real workerd
// builtins in the fixtures. Nothing here is a hand-picked replacement.
import path from "node:path";
import * as querystring from "node:querystring";
import { StringDecoder } from "node:string_decoder";
import { FeatureImplementation } from "@rdlabo/capacitor-workers/features";
import {
  runContract,
  type ContractResult,
} from "@rdlabo/capacitor-workers/testing";
import {
  nodePathContract,
  nodePathFeature,
  type NodePathApi,
} from "./contracts/node-path";
import {
  nodeQuerystringContract,
  nodeQuerystringFeature,
} from "./contracts/node-querystring";
import {
  nodeStringDecoderContract,
  nodeStringDecoderFeature,
  type NodeStringDecoderApi,
} from "./contracts/node-string-decoder";

const cwdExcluded = {
  status: "unsupported",
  reason:
    "resolve/relative with relative inputs need the virtual process cwd " +
    "(Workers reports /bundle); no virtual process profile exists yet",
} as const;
const win32Excluded = {
  status: "unsupported",
  reason: "win32 is outside the POSIX-only batch",
} as const;
const supported = { status: "supported" } as const;

/** The module as resolved by the bundler compatibility aliases. */
export class BundledPath extends FeatureImplementation<typeof nodePathFeature> {
  constructor() {
    super(nodePathFeature, {
      joinNormalize: supported,
      resolveAbsolute: supported,
      relativeAbsolute: supported,
      dirnameBasename: supported,
      extname: supported,
      parseFormat: supported,
      constants: supported,
      typeErrors: supported,
      cwdRelative: cwdExcluded,
      win32: win32Excluded,
    });
  }
  create(): NodePathApi {
    return path;
  }
}

/** The module as provided by real workerd. */
export class WorkersPath extends FeatureImplementation<typeof nodePathFeature> {
  constructor() {
    super(nodePathFeature, {
      joinNormalize: supported,
      resolveAbsolute: supported,
      relativeAbsolute: supported,
      dirnameBasename: supported,
      extname: supported,
      parseFormat: supported,
      constants: supported,
      typeErrors: supported,
      cwdRelative: supported,
      win32: supported,
    });
  }
  create(): NodePathApi {
    return path;
  }
}

export class NodeQuerystring extends FeatureImplementation<
  typeof nodeQuerystringFeature
> {
  constructor() {
    super(nodeQuerystringFeature, {
      parseDuplicates: supported,
      parseLimits: supported,
      parseSeparators: supported,
      parseMalformed: supported,
      stringifyValues: supported,
      escapeUnescape: supported,
      customCodecs: supported,
      aliases: supported,
    });
  }
  create() {
    return querystring;
  }
}

export class NodeStringDecoder extends FeatureImplementation<
  typeof nodeStringDecoderFeature
> {
  constructor() {
    super(nodeStringDecoderFeature, {
      utf8Split: supported,
      utf8EndFlush: supported,
      utf16le: supported,
      singleByteEncodings: supported,
      hex: supported,
      base64: supported,
      encodings: supported,
      endAndReuse: supported,
    });
  }
  create() {
    // @types/node restricts the constructor to BufferEncoding; the runtime
    // accepts and rejects arbitrary strings, which the contract exercises.
    return {
      StringDecoder:
        StringDecoder as unknown as NodeStringDecoderApi["StringDecoder"],
    };
  }
}

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
