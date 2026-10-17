import { defineFeature } from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";

/** Bounded node:querystring profile. */
export interface NodeQuerystringApi {
  parse(
    input: unknown,
    sep?: string | null,
    eq?: string | null,
    options?: {
      maxKeys?: number;
      decodeURIComponent?: (input: string) => string;
    },
  ): Record<string, string | string[] | undefined>;
  stringify(
    input: unknown,
    sep?: string | null,
    eq?: string | null,
    options?: { encodeURIComponent?: (input: string) => string },
  ): string;
  decode: NodeQuerystringApi["parse"];
  encode: NodeQuerystringApi["stringify"];
  escape(input: unknown): string;
  unescape(input: unknown): string;
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

export const nodeQuerystringFeature = defineFeature<NodeQuerystringApi>()(
  "node.querystring",
  [
    "parseDuplicates",
    "parseLimits",
    "parseSeparators",
    "parseMalformed",
    "stringifyValues",
    "escapeUnescape",
    "customCodecs",
    "aliases",
  ],
);

export const nodeQuerystringContract: ContractSuite<
  typeof nodeQuerystringFeature
> = {
  feature: nodeQuerystringFeature,
  cases: {
    parseDuplicates(api) {
      equal(api.parse("a=1&a=2&b=3"), { a: ["1", "2"], b: "3" });
      const parsed = api.parse("__proto__=1&a=b");
      equal(parsed.__proto__, "1");
      equal(Object.getPrototypeOf(parsed), null);
      equal(parsed.a, "b");
      equal(api.parse("=v&&x"), { "": "v", x: "" });
      equal(api.parse(""), {});
    },
    parseLimits(api) {
      // Duplicate pairs count against maxKeys; empty pairs consume the slot.
      equal(api.parse("a=1&a=2&b=3", null, null, { maxKeys: 2 }), {
        a: ["1", "2"],
      });
      equal(api.parse("&a=1&b=2", null, null, { maxKeys: 1 }), {});
      equal(api.parse("a=1&b=2", null, null, { maxKeys: 0 }), {
        a: "1",
        b: "2",
      });
      equal(api.parse("a=1&b=2", null, null, { maxKeys: 1000 }), {
        a: "1",
        b: "2",
      });
    },
    parseSeparators(api) {
      equal(api.parse("a=1;b=2", ";"), { a: "1", b: "2" });
      equal(api.parse("a=1&b=2", "", ""), { a: "1", b: "2" });
      equal(api.parse("x=%EF%BB%BFa"), { x: "\uFEFFa" });
      equal(api.parse("a=1;;b=2", ";;"), { a: "1", b: "2" });
      equal(api.parse("a::b::c", null, "::"), { a: "b::c" });
      equal(api.parse("a=b=c"), { a: "b=c" });
      equal(api.parse("a+b=c+d&e%20f=%2B"), { "a b": "c d", "e f": "+" });
      equal(api.parse("%F0%9F%8D%B7=wine"), { "🍷": "wine" });
    },
    parseMalformed(api) {
      // Malformed escapes stay literal or decode to U+FFFD; never throw.
      equal(api.parse("a=%E0%A4%A&b=%ZZ&c=%41"), {
        a: "�%A",
        b: "%ZZ",
        c: "A",
      });
      equal(api.parse("k=%u2603"), { k: "%u2603" });
      equal(api.parse("k=%ED%A0%80"), { k: "���" });
      equal(api.parse("k=abc%"), { k: "abc%" });
    },
    stringifyValues(api) {
      equal(
        api.stringify({ a: [1, "x"], b: null, c: undefined, d: true, e: {} }),
        "a=1&a=x&b=&c=&d=true&e=",
      );
      equal(
        api.stringify({ a: 0, b: -1, c: 1.5, n: NaN, i: Infinity }),
        "a=0&b=-1&c=1.5&n=&i=",
      );
      equal(api.stringify({ a: [[1, 2], 3] }), "a=&a=3");
      equal(
        api.stringify({ hasOwnProperty: 1, toString: 2 }),
        "hasOwnProperty=1&toString=2",
      );
      equal(api.stringify(null), "");
    },
    escapeUnescape(api) {
      equal(
        api.escape(" !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"),
        "%20!%22%23%24%25%26'()*%2B%2C-.%2F%3A%3B%3C%3D%3E%3F%40%5B%5C%5D%5E_%60%7B%7C%7D~",
      );
      equal(api.escape("🍷 a+b"), "%F0%9F%8D%B7%20a%2Bb");
      equal(api.escape("a\uD800b"), "a%F0%90%81%A2");
      equal(api.unescape("%F0%9F%8D%B7%20%41%42"), "🍷 AB");
      equal(api.unescape("a+b"), "a+b");
      equal(api.unescape("a%20b"), "a b");
    },
    customCodecs(api) {
      equal(api.parse("x=%E0%A4%A", null, null, { decodeURIComponent }), {
        x: "�%A",
      });
      const seen: string[] = [];
      equal(
        api.parse("a+b=c+d", null, null, {
          decodeURIComponent: (s: string) => (seen.push(s), `[${s}]`),
        }),
        { "[a%20b]": "[c%20d]" },
      );
      equal(seen, ["a%20b", "c%20d"]);
      equal(
        api.stringify({ "a b": "x y" }, null, null, {
          encodeURIComponent: (s: string) => `<${s}>`,
        }),
        "<a b>=<x y>",
      );
    },
    aliases(api) {
      equal(api.decode === api.parse, true);
      equal(api.encode === api.stringify, true);
      equal(api.decode("x=1"), { x: "1" });
      equal(api.encode({ x: 1 }), "x=1");
      throws(() => api.escape("x\uD800"), /URIError/);
    },
  },
};
