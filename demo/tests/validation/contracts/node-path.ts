import { defineFeature } from "@rdlabo/capacitor-workers/features";
import type { ContractSuite } from "@rdlabo/capacitor-workers/testing";

/** Bounded node:path profile: the POSIX family. */
export interface NodePathApi {
  basename(path: string, suffix?: string): string;
  delimiter: string;
  dirname(path: string): string;
  extname(path: string): string;
  format(object: {
    root?: string;
    dir?: string;
    base?: string;
    ext?: string;
    name?: string;
  }): string;
  isAbsolute(path: string): boolean;
  join(...segments: string[]): string;
  normalize(path: string): string;
  parse(path: string): {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
  };
  relative(from: string, to: string): string;
  resolve(...segments: string[]): string;
  sep: string;
  toNamespacedPath(path: string): string;
  posix: NodePathApi;
  win32: NodePathApi | null;
}

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function throws(fn: () => unknown, name: string) {
  try {
    fn();
  } catch (error) {
    if ((error as { name?: string })?.name === name) return;
    throw new Error(`Unexpected error: ${error}`);
  }
  throw new Error(`Expected ${name} to be thrown`);
}

export const nodePathFeature = defineFeature<NodePathApi>()("node.path", [
  "joinNormalize",
  "resolveAbsolute",
  "relativeAbsolute",
  "dirnameBasename",
  "extname",
  "parseFormat",
  "constants",
  "typeErrors",
  "cwdRelative",
  "win32",
]);

export const nodePathContract: ContractSuite<typeof nodePathFeature> = {
  feature: nodePathFeature,
  cases: {
    joinNormalize(api) {
      equal(api.join("a//b", "./c"), "a/b/c");
      equal(api.join(), ".");
      equal(api.normalize("/a//b/./c/.."), "/a/b");
      equal(api.normalize("../a/./b"), "../a/b");
      equal(api.normalize(""), ".");
      equal(api.normalize("a/b/"), "a/b/");
      equal(api.normalize("/"), "/");
    },
    resolveAbsolute(api) {
      // Absolute inputs only; relative-input resolution is a separate case
      // because it depends on the virtual process cwd.
      equal(api.resolve("/a", "b", "../c"), "/a/c");
      equal(api.resolve("a", "/b"), "/b");
      equal(api.resolve("/a"), "/a");
      equal(api.resolve("/a", "/b"), "/b");
    },
    relativeAbsolute(api) {
      equal(api.relative("/a/b/c", "/a"), "../..");
      equal(api.relative("/a", "/a/b"), "b");
      equal(api.relative("/a", "/b"), "../b");
      equal(api.relative("/", "/x"), "x");
      equal(api.relative("/a", "/a"), "");
    },
    dirnameBasename(api) {
      equal(api.dirname("/a/b/c"), "/a/b");
      equal(api.dirname("a"), ".");
      equal(api.dirname("/"), "/");
      equal(api.dirname("//a"), "//");
      equal(api.basename("/a/b.txt", ".txt"), "b");
      equal(api.basename("/a/bbb", "bb"), "b");
      equal(api.basename("a/"), "a");
      equal(api.basename(""), "");
    },
    extname(api) {
      equal(api.extname("a.b.c"), ".c");
      equal(api.extname(".a"), "");
      equal(api.extname("a."), ".");
      equal(api.extname("a/b"), "");
      equal(api.extname(""), "");
    },
    parseFormat(api) {
      equal(api.parse("/a/b.txt"), {
        root: "/",
        dir: "/a",
        base: "b.txt",
        ext: ".txt",
        name: "b",
      });
      equal(api.parse(""), {
        root: "",
        dir: "",
        base: "",
        ext: "",
        name: "",
      });
      equal(api.format({ dir: "/a", name: "b", ext: ".c" }), "/a/b.c");
      equal(api.format({ root: "/", base: "b.txt" }), "/b.txt");
      equal(api.format({ base: "b" }), "b");
      equal(api.format({ name: "a", ext: "txt" }), "a.txt");
      equal(
        api.format(Object.create({ dir: "/a", name: "b", ext: "txt" })),
        "/a/b.txt",
      );
      equal(
        api.format({ base: "b.txt", ext: 123 as unknown as string }),
        "b.txt",
      );
    },
    constants(api) {
      equal(api.sep, "/");
      equal(api.delimiter, ":");
      equal(api.isAbsolute("/x"), true);
      equal(api.isAbsolute("x"), false);
      equal(api.toNamespacedPath("/a"), "/a");
      equal(api.toNamespacedPath(123 as unknown as string), 123);
      equal(api.posix.join("a", "b"), "a/b");
      equal(api.posix === api, true);
    },
    typeErrors(api) {
      throws(() => api.join("a", 1 as unknown as string), "TypeError");
      throws(() => api.parse({} as unknown as string), "TypeError");
    },
    cwdRelative(api) {
      // Relative inputs resolve against the process cwd. workerd resolves
      // them against "/"; the browser profile declares this case
      // unsupported until a virtual process profile exists.
      equal(api.resolve("b"), "/b");
      equal(api.relative("a/b", "a/c"), "../c");
    },
    win32(api) {
      // Runs where the implementation declares win32 support; the POSIX-only
      // batch declares this case unsupported rather than guessing.
      const win32 = api.win32;
      if (win32 === null) throw new Error("win32 is absent");
      equal(win32.join("C:\\a", "b"), "C:\\a\\b");
      equal(win32.sep, "\\");
    },
  },
};
