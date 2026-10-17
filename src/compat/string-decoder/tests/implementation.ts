import { StringDecoder } from "node:string_decoder";
import { FeatureImplementation } from "@rdlabo/capacitor-workers/features";
import {
  nodeStringDecoderFeature,
  type NodeStringDecoderApi,
} from "./contract";
const supported = { status: "supported" } as const;

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
