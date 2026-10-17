import path from "node:path";
import { FeatureImplementation } from "@rdlabo/capacitor-workers/features";
import { nodePathFeature, type NodePathApi } from "./contract";

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
