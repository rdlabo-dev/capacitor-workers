declare module "path-browserify" {
  const path: {
    resolve(...paths: string[]): string;
    normalize(path: string): string;
    isAbsolute(path: string): boolean;
    join(...paths: string[]): string;
    relative(from: string, to: string): string;
    dirname(path: string): string;
    basename(path: string, ext?: string): string;
    extname(path: string): string;
    format(pathObject: {
      root?: string;
      dir?: string;
      base?: string;
      ext?: string;
      name?: string;
    }): string;
    parse(path: string): {
      root: string;
      dir: string;
      base: string;
      ext: string;
      name: string;
    };
    sep: string;
    delimiter: string;
    posix: unknown;
    win32: unknown;
  };
  export default path;
}
