import { expect, it } from "vitest";
import { installWebGlobals } from "./web.js";
import { Request } from "../request/index.js";
import { platform } from "./platform.js";

it("restores original accessor and non-enumerable descriptors after the last owner", () => {
  const target = {};
  const get = () => platform.Request;
  Object.defineProperty(target, "Request", {
    get,
    configurable: true,
    enumerable: false,
  });
  const before = Object.getOwnPropertyDescriptors(target);
  const first = installWebGlobals(target);
  const second = installWebGlobals(target);
  expect(Reflect.get(target, "Request")).toBe(Request);
  first();
  first();
  expect(Reflect.get(target, "Request")).toBe(Request);
  second();
  expect(Object.getOwnPropertyDescriptors(target)).toEqual(before);
});
it("rolls back earlier changes if a later global is non-configurable", () => {
  const target = { Request: platform.Request };
  Object.defineProperty(target, "Headers", {
    value: platform.Headers,
    configurable: false,
  });
  const before = Object.getOwnPropertyDescriptors(target);
  expect(() => installWebGlobals(target)).toThrow();
  expect(Object.getOwnPropertyDescriptors(target)).toEqual(before);
});
it("leaves a later application replacement intact and rejects a second owner", () => {
  const target: Record<string, unknown> = {};
  const restore = installWebGlobals(target);
  target.Request = class ApplicationRequest {};
  expect(() => installWebGlobals(target)).toThrow(
    "changed during installation",
  );
  const replacement = target.Request;
  restore();
  expect(target.Request).toBe(replacement);
  expect(Object.getOwnPropertyNames(target)).toEqual(["Request"]);
});
it("body codecs do not recurse through the installed Response", async () => {
  const restore = installWebGlobals();
  try {
    const response = new globalThis.Response("body");
    expect(await response.text()).toBe("body");
    expect(platform.Response).not.toBe(globalThis.Response);
  } finally {
    restore();
  }
  expect(globalThis.Response).toBe(platform.Response);
});

it("owns and restores a missing resource-management symbol alongside Web globals", () => {
  const symbol = {};
  const target = { Symbol: symbol };
  const first = installWebGlobals(target);
  const installed = Object.getOwnPropertyDescriptor(symbol, "asyncDispose");
  expect(typeof installed?.value).toBe("symbol");
  const second = installWebGlobals(target);
  first();
  expect(Object.getOwnPropertyDescriptor(symbol, "asyncDispose")).toEqual(
    installed,
  );
  second();
  expect(Object.hasOwn(symbol, "asyncDispose")).toBe(false);
});

it("owns the AbortSignal timeout method without replacing native branding", async () => {
  const constructor = globalThis.AbortSignal;
  const previous = Object.getOwnPropertyDescriptor(constructor, "timeout");
  const first = installWebGlobals();
  const second = installWebGlobals();
  try {
    expect(globalThis.AbortSignal).toBe(constructor);
    const signal = AbortSignal.timeout(-1);
    expect(signal).toBeInstanceOf(constructor);
    expect(signal.constructor).toBe(constructor);
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    expect(signal.reason.name).toBe("TimeoutError");
    first();
    expect(
      Object.getOwnPropertyDescriptor(constructor, "timeout")?.value,
    ).not.toBe(previous?.value);
  } finally {
    first();
    second();
  }
  expect(Object.getOwnPropertyDescriptor(constructor, "timeout")).toEqual(
    previous,
  );
});

it("preserves a later app timeout replacement and rejects another owner", () => {
  const constructor = globalThis.AbortSignal;
  const previous = Object.getOwnPropertyDescriptor(constructor, "timeout")!;
  const release = installWebGlobals();
  const replacement = () => new AbortController().signal;
  try {
    Object.defineProperty(constructor, "timeout", {
      ...previous,
      value: replacement,
    });
    expect(() => installWebGlobals()).toThrow("AbortSignal.timeout changed");
    release();
    expect(constructor.timeout).toBe(replacement);
  } finally {
    release();
    Object.defineProperty(constructor, "timeout", previous);
  }
});
