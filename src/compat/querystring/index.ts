// Bounded Workers node:querystring profile.
//
// Implemented here rather than via querystring-es3 / the stdlib proxy: the
// installed polyfill throws URIError on malformed percent escapes, returns
// Object.prototype results that silently drop "__proto__" keys, and provides
// no escape/unescape exports at all. Semantics below follow the observed
// Node/Workers behavior and are pinned by the shared contract cases.

import { Buffer } from "node:buffer";

export interface ParseOptions {
  maxKeys?: number;
  decodeURIComponent?: (input: string) => string;
}

export interface StringifyOptions {
  encodeURIComponent?: (input: string) => string;
}

const utf8 = new TextDecoder("utf-8", { ignoreBOM: true });
const utf8Encode = new TextEncoder();

function isHexDigit(code: number) {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 70) || // A-F
    (code >= 97 && code <= 102) // a-f
  );
}

// Percent-encoding: unreserved set is 0-9 a-z A-Z - _ . ! ~ * ' ( ). Node
// treats any following code unit as the low half of a surrogate pair and
// rejects a trailing surrogate with URIError; that behavior is reproduced.
export function escape(input: unknown): string {
  if (typeof input === "symbol")
    throw new TypeError("Cannot convert a Symbol value to a string");
  const s = String(input);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    let codePoint = s.charCodeAt(i);
    if (
      (codePoint >= 48 && codePoint <= 57) || // 0-9
      (codePoint >= 65 && codePoint <= 90) || // A-Z
      (codePoint >= 97 && codePoint <= 122) || // a-z
      codePoint === 33 || // !
      codePoint === 39 || // '
      codePoint === 40 || // (
      codePoint === 41 || // )
      codePoint === 42 || // *
      codePoint === 45 || // -
      codePoint === 46 || // .
      codePoint === 95 || // _
      codePoint === 126 // ~
    ) {
      out += s[i];
      continue;
    }
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      if (++i >= s.length) throw new URIError("URI malformed");
      codePoint =
        0x10000 +
        (((codePoint - 0xd800) & 0x3ff) << 10) +
        (s.charCodeAt(i) & 0x3ff);
    }
    for (const byte of utf8Encode.encode(String.fromCodePoint(codePoint)))
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

// Workers first tries URI decoding. On malformed input it decodes bytes,
// including the low byte of unescaped UTF-16 code units.
export function unescapeBuffer(input: string, decodeSpaces = false): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (
      code === 37 &&
      i + 2 < input.length &&
      isHexDigit(input.charCodeAt(i + 1)) &&
      isHexDigit(input.charCodeAt(i + 2))
    ) {
      bytes.push(parseInt(input.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(code === 43 && decodeSpaces ? 32 : code & 255);
  }
  return Buffer.from(bytes);
}

export function unescape(input: unknown, decodeSpaces = false): string {
  if (typeof input === "symbol")
    throw new TypeError("Cannot convert a Symbol value to a string");
  const s = String(input);
  try {
    return decodeURIComponent(s);
  } catch {
    return utf8.decode(unescapeBuffer(s, decodeSpaces));
  }
}

type QueryObject = Record<string, string | string[]>;

function setEntry(obj: QueryObject, key: string, value: string) {
  if (Object.hasOwn(obj, key)) {
    const existing = obj[key];
    if (Array.isArray(existing)) existing.push(value);
    else obj[key] = [existing, value];
  } else {
    obj[key] = value;
  }
}

export function parse(
  input: unknown,
  sep?: string,
  eq?: string,
  options?: ParseOptions,
): QueryObject {
  const obj: QueryObject = Object.create(null);
  if (typeof input !== "string" || input.length === 0) return obj;
  const separator = sep ? String(sep) : "&";
  const equals = eq ? String(eq) : "=";
  const decoder = options?.decodeURIComponent;
  const maxKeys =
    options && typeof options.maxKeys === "number" ? options.maxKeys : 1000;
  const pairs = input.split(separator);
  const count =
    maxKeys > 0 && Number.isInteger(maxKeys)
      ? Math.min(maxKeys, pairs.length)
      : pairs.length;
  for (let i = 0; i < count; i++) {
    const pair = pairs[i];
    if (pair.length === 0) continue;
    const split = pair.indexOf(equals);
    const rawKey = split < 0 ? pair : pair.slice(0, split);
    const rawValue = split < 0 ? "" : pair.slice(split + equals.length);
    const decodePart = (raw: string) => {
      if (typeof decoder === "function") {
        try {
          return decoder(raw.replace(/\+/g, "%20"));
        } catch {
          /* Workers falls back to its forgiving decoder. */
        }
      }
      return unescape(raw.replace(/\+/g, "%20"), true);
    };
    const key = decodePart(rawKey);
    const value = decodePart(rawValue);
    setEntry(obj, key, value);
  }
  return obj;
}

function stringifyPrimitive(value: unknown): string {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
      return Number.isFinite(value) ? String(value) : "";
    case "boolean":
      return String(value);
    case "bigint":
      return String(value);
    default:
      return "";
  }
}

export function stringify(
  input: unknown,
  sep?: string,
  eq?: string,
  options?: StringifyOptions,
): string {
  const separator = sep === undefined || sep === null ? "&" : String(sep);
  const equals = eq === undefined || eq === null ? "=" : String(eq);
  const encoder =
    typeof options?.encodeURIComponent === "function"
      ? options.encodeURIComponent
      : escape;
  if (input === null || typeof input !== "object") return "";
  const pairs: string[] = [];
  for (const key of Object.keys(input)) {
    const encodedKey = encoder(key);
    const value = (input as Record<string, unknown>)[key];
    const values = Array.isArray(value) ? value : [value];
    for (const item of values)
      pairs.push(`${encodedKey}${equals}${encoder(stringifyPrimitive(item))}`);
  }
  return pairs.join(separator);
}

export const decode = parse;
export const encode = stringify;

export default {
  decode,
  encode,
  escape,
  parse,
  stringify,
  unescape,
  unescapeBuffer,
};
