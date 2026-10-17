import { StringDecoder } from "node:string_decoder";
import {
  defineFeature,
  FeatureImplementation,
} from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";

/** Bounded node:string_decoder profile. */
export interface NodeStringDecoderApi {
  StringDecoder: new (encoding?: string) => {
    encoding: string;
    write(buffer: ArrayBufferView | string): string;
    end(buffer?: ArrayBufferView | string): string;
  };
}

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function throws(fn: () => unknown, match: RegExp) {
  try {
    fn();
  } catch (error) {
    if (match.test(String(error))) return;
    throw new Error(`Unexpected error: ${error}`);
  }
  throw new Error(`Expected ${match} to be thrown`);
}

export const nodeStringDecoderFeature = defineFeature<NodeStringDecoderApi>()(
  "node.string_decoder",
  [
    "utf8Split",
    "utf8EndFlush",
    "utf16le",
    "singleByteEncodings",
    "hex",
    "base64",
    "encodings",
    "endAndReuse",
  ],
);

export const nodeStringDecoderContract: ContractSuite<
  typeof nodeStringDecoderFeature
> = {
  feature: nodeStringDecoderFeature,
  cases: {
    utf8Split(api) {
      const decoder = new api.StringDecoder("utf8");
      equal(decoder.write(new Uint8Array([0xe3, 0x81])), "");
      equal(decoder.write(new Uint8Array([0x82])), "あ");
      equal(decoder.end(), "");
      // Views decode their own window, not the whole backing buffer.
      const window = new Uint8Array([0xff, 0x61, 0x62, 0xff]).subarray(1, 3);
      equal(new api.StringDecoder().write(window), "ab");
      const view = new DataView(new Uint8Array([0x99, 0x63]).buffer, 1, 1);
      equal(new api.StringDecoder().write(view), "c");
      throws(
        () =>
          new api.StringDecoder().write(
            new ArrayBuffer(1) as unknown as ArrayBufferView,
          ),
        /TypeError/,
      );
    },
    utf8EndFlush(api) {
      const decoder = new api.StringDecoder();
      decoder.write(new Uint8Array([0xe3, 0x81]));
      equal(decoder.end(), "�");
      const second = new api.StringDecoder("utf8");
      equal(second.write(new Uint8Array([0xe3, 0x81, 0x82, 0xe3])), "あ");
      equal(second.end(), "�");
    },
    utf16le(api) {
      const decoder = new api.StringDecoder("utf16le");
      equal(decoder.write(new Uint8Array([0x42])), "");
      // An odd trailing byte is dropped at end(), not replaced.
      equal(decoder.end(), "");
      const pair = new api.StringDecoder("utf16le");
      equal(pair.write(new Uint8Array([0x42, 0x30])), "あ");
      equal(pair.end(), "");
    },
    singleByteEncodings(api) {
      equal(
        new api.StringDecoder("latin1").write(new Uint8Array([0xe3, 0x81])),
        "ã",
      );
      equal(new api.StringDecoder("binary").write(new Uint8Array([0xe3])), "ã");
      equal(
        new api.StringDecoder("ascii").write(new Uint8Array([0xe3, 0x81])),
        "c\u0001",
      );
    },
    hex(api) {
      const decoder = new api.StringDecoder("hex");
      equal(decoder.write(new Uint8Array([0x41, 0x42, 0x43])), "414243");
      equal(decoder.end(), "");
    },
    base64(api) {
      const url = new api.StringDecoder("BASE64URL");
      equal(url.encoding, "base64url");
      equal(url.write(new Uint8Array([255])), "");
      equal(url.end(new Uint8Array([255])), "__8");
      equal(
        new api.StringDecoder("base64url").end(new Uint8Array([251, 255, 255])),
        "-___",
      );
      const one = new api.StringDecoder("base64");
      equal(one.write(new Uint8Array([0x41])), "");
      equal(one.end(), "QQ==");
      const two = new api.StringDecoder("base64");
      equal(two.write(new Uint8Array([0x41, 0x42])), "");
      equal(two.end(), "QUI=");
      const full = new api.StringDecoder("base64");
      equal(full.write(new Uint8Array([0xe3, 0x81, 0x82])), "44GC");
    },
    encodings(api) {
      for (const [alias, normalized] of [
        ["utf-8", "utf8"],
        ["utf-16le", "utf16le"],
        ["ucs-2", "utf16le"],
        ["ucs2", "utf16le"],
        ["binary", "latin1"],
      ] as const)
        equal(new api.StringDecoder(alias).encoding, normalized);
      throws(() => new api.StringDecoder("bogus"), /Unknown encoding.*bogus/i);
    },
    endAndReuse(api) {
      const decoder = new api.StringDecoder();
      equal(decoder.end(new Uint8Array([0x68, 0x69])), "hi");
      // end() flushes but does not terminate the decoder.
      equal(decoder.write(new Uint8Array([0x61])), "a");
      equal(decoder.write("ab"), "ab");
      for (const invalid of [null, false, 123, {}, new ArrayBuffer(1)]) {
        throws(
          () => new api.StringDecoder().write(invalid as unknown as string),
          /TypeError/,
        );
        throws(
          () => new api.StringDecoder().end(invalid as unknown as string),
          /TypeError/,
        );
      }
      // Chunk boundaries must not change the result or leak decoder state.
      for (const [encoding, bytes, expected] of [
        ["utf8", [0x61, 0xf0, 0x9f, 0x8d, 0xb7, 0x62], "a🍷b"],
        ["utf16le", [0x3c, 0xd8, 0x77, 0xdf], "🍷"],
        ["base64", [251, 255, 255, 255], "+////w=="],
      ] as const) {
        for (let split = 0; split <= bytes.length; split++) {
          const d = new api.StringDecoder(encoding);
          equal(
            d.write(new Uint8Array(bytes.slice(0, split))) +
              d.end(new Uint8Array(bytes.slice(split))),
            expected,
          );
        }
      }
    },
  },
};

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
