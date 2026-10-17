import * as querystring from "node:querystring";
import { FeatureImplementation } from "@rdlabo/capacitor-workers/features";
import { nodeQuerystringFeature } from "./contract";
const supported = { status: "supported" } as const;

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
