// node:path/posix and path/posix resolve here: the same bounded POSIX
// profile as node:path.
import { posix } from "../index.js";

export const {
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
  win32,
} = posix;
export { posix };
export default posix;
