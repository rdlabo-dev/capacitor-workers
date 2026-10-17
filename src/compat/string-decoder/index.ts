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
  readonly #base64url: boolean;

  constructor(encoding?: string) {
    this.#base64url =
      typeof encoding === "string" && encoding.toLowerCase() === "base64url";
    this.#inner = new UpstreamStringDecoder(
      this.#base64url ? "base64" : encoding,
    );
  }

  get encoding() {
    return this.#base64url ? "base64url" : this.#inner.encoding;
  }

  #output(value: string): string {
    return this.#base64url
      ? value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
      : value;
  }

  write(buffer: StringDecoderInput): string {
    return typeof buffer === "string"
      ? buffer
      : this.#output(this.#inner.write(toBuffer(buffer)));
  }

  end(buffer?: StringDecoderInput): string {
    const prefix = buffer === undefined ? "" : this.write(buffer);
    return prefix + this.#output(this.#inner.end());
  }
}

export default { StringDecoder };
