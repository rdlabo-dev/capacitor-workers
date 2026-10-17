// Bounded Workers node:path profile: the tested path-browserify POSIX
// surface plus the missing toNamespacedPath passthrough.
//
// Excluded behavior is preserved, not widened: `win32` stays the polyfill's
// absent value and `resolve`/`relative` keep consulting the ambient
// `process.cwd()` for relative inputs, so no invented virtual cwd enters the
// profile. Workers' own default cwd is a separate process-profile item.
import pathBrowserify from "path-browserify";

export interface ParsedPath {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}

export interface FormatInput {
  root?: string;
  dir?: string;
  base?: string;
  ext?: string;
  name?: string;
}

/** The bounded POSIX surface plus Node's self-referencing posix/win32 shape. */
export interface PathApi {
  basename(path: string, suffix?: string): string;
  delimiter: string;
  dirname(path: string): string;
  extname(path: string): string;
  format(pathObject: FormatInput): string;
  isAbsolute(path: string): boolean;
  join(...segments: string[]): string;
  normalize(path: string): string;
  parse(path: string): ParsedPath;
  relative(from: string, to: string): string;
  resolve(...segments: string[]): string;
  sep: string;
  toNamespacedPath(path: string): string;
  posix: PathApi;
  win32: PathApi | null;
}

const source = pathBrowserify as PathApi;

export const basename = source.basename;
export const delimiter = source.delimiter;
export const dirname = source.dirname;
export const extname = source.extname;
export function format(pathObject: FormatInput): string {
  if (!pathObject || typeof pathObject !== "object")
    return source.format(pathObject);
  const dir = pathObject.dir || pathObject.root;
  const base = pathObject.base;
  if (base) return source.format({ dir, root: pathObject.root, base });
  const ext = pathObject.ext;
  return source.format({
    dir,
    root: pathObject.root,
    name: pathObject.name,
    ext: ext && ext[0] !== "." ? `.${ext}` : ext,
  });
}
export const isAbsolute = source.isAbsolute;
export const join = source.join;
export const normalize = source.normalize;
export const parse = source.parse;
export const relative = source.relative;
export const resolve = source.resolve;
export const sep = source.sep;

// POSIX paths are already namespaced; Node's own posix variant is a
// passthrough that path-browserify does not include.
export function toNamespacedPath(path: string) {
  return path;
}

const api: PathApi = {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
  sep,
  toNamespacedPath,
  posix: undefined as unknown as PathApi,
  win32: source.win32,
};
api.posix = api;

export const posix = api;
export const win32 = api.win32;

export default api;
