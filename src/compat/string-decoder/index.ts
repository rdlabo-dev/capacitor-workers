// Bounded Workers node:string_decoder profile.
//
// Thin adapter over the extracted upstream implementation: Workers' API
// accepts Buffer, TypedArray, DataView inputs, while the
// package's algorithms operate on Buffer. Inputs are converted preserving
// byteOffset/byteLength so view windows decode correctly; strings pass
// through unchanged, matching Node.
import { Buffer } from "node:buffer";
import { StringDecoder as UpstreamStringDecoder } from "string_decoder/lib/string_decoder.js";

export type StringDecoderInput = ArrayBufferView | string;

function toBuffer(input: Exclude<StringDecoderInput, string>) {
  if (ArrayBuffer.isView(input))
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError(
    'The "buf" argument must be an instance of Buffer, TypedArray, ' +
      `or DataView. Received ${input}`,
  );
}

export class StringDecoder {
  readonly #inner: UpstreamStringDecoder;

  constructor(encoding?: string) {
    this.#inner = new UpstreamStringDecoder(encoding);
  }

  get encoding() {
    return this.#inner.encoding;
  }

  write(buffer: StringDecoderInput): string {
    return typeof buffer === "string"
      ? buffer
      : this.#inner.write(toBuffer(buffer));
  }

  end(buffer?: StringDecoderInput): string {
    const prefix = buffer === undefined ? "" : this.write(buffer);
    return prefix + this.#inner.end();
  }
}

export default { StringDecoder };
