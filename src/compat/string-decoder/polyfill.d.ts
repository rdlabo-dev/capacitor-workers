declare module "string_decoder/lib/string_decoder.js" {
  export class StringDecoder {
    constructor(encoding?: string);
    encoding: string;
    write(buffer: Uint8Array): string;
    end(buffer?: Uint8Array): string;
  }
}
