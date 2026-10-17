/** Stable fallback for engines without explicit resource management symbols. */
export const asyncDispose: typeof Symbol.asyncDispose = (Symbol.asyncDispose ??
  Symbol.for("Symbol.asyncDispose")) as typeof Symbol.asyncDispose;

export function installResourceSymbols(symbol: SymbolConstructor | undefined) {
  if (!symbol || symbol.asyncDispose !== undefined) return () => {};
  const previous = Object.getOwnPropertyDescriptor(symbol, "asyncDispose");
  Object.defineProperty(symbol, "asyncDispose", {
    value: asyncDispose,
    configurable: true,
  });
  return () => {
    const descriptor = Object.getOwnPropertyDescriptor(symbol, "asyncDispose");
    if (
      descriptor?.value === asyncDispose &&
      descriptor.configurable &&
      !descriptor.writable &&
      !descriptor.enumerable
    ) {
      if (previous) Object.defineProperty(symbol, "asyncDispose", previous);
      else Reflect.deleteProperty(symbol, "asyncDispose");
    }
  };
}
