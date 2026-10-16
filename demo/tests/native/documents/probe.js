// Native-injected test driver. The application documents contain no test runner.
async function runDocumentProbe() {
  if (!location.pathname.startsWith("/pages/")) return;
  const key = "native-document-probe";
  const state = JSON.parse(
    sessionStorage.getItem(key) || '{"step":0,"cases":[]}',
  );
  if (window.documentProbeStep === state.step) return;
  window.documentProbeStep = state.step;
  // A script submitting during the initial load may replace the history entry.
  // Exercise a loaded document, as a user interacting with the form would.
  if (document.readyState !== "complete")
    await new Promise((resolve) =>
      window.addEventListener("load", resolve, { once: true }),
    );
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const save = () => sessionStorage.setItem(key, JSON.stringify(state));
  const check = async (name, predicate) => {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(name);
      await new Promise((r) => setTimeout(r, 50));
    }
    state.cases.push({ name, passed: true });
    save();
  };
  const next = (action) => {
    state.step++;
    save();
    action();
  };
  const report = () => {
    const result = {
      url: location.href,
      framework: state.framework,
      cases: state.cases,
      diagnostics: state.diagnostics,
    };
    localStorage.setItem("native-document-result", JSON.stringify(result));
    window.webkit?.messageHandlers?.documentFetch?.postMessage({
      report: result,
    });
    const output = document.createElement("pre");
    output.id = "native-document-report";
    output.style.cssText = "white-space:pre-wrap;font:12px/1.5 monospace";
    output.textContent =
      `${state.framework}: ${state.cases.filter((c) => c.passed).length}/${state.cases.length} passed\n` +
      state.cases
        .map(
          (c) =>
            `${c.passed ? "PASS" : "FAIL"} ${c.name}${c.error ? ": " + c.error : ""}`,
        )
        .join("\n");
    document.body.replaceChildren(output);
    document.body.style.cssText = "padding:48px 12px 24px;";
    console.log("NATIVE_DOCUMENT_RESULT", JSON.stringify(result));
  };
  try {
    if (state.step === 0) {
      localStorage.removeItem("native-document-result");
      state.framework = document.title.startsWith("Hono") ? "Hono" : "Express";
      await check(
        "initial document",
        () => document.title === state.framework + " document",
      );
      await check(
        "standards mode, top-level",
        () =>
          document.compatMode === "CSS1Compat" &&
          !document.querySelector("iframe"),
      );
      await check(
        "inline script",
        () => document.querySelector("#inline")?.textContent === "inline ready",
      );
      await check(
        "classic script",
        () =>
          document.querySelector("#classic")?.textContent === "classic ready",
      );
      await check(
        "module and import",
        () => document.querySelector("#module")?.textContent === "module ready",
      );
      await check(
        "native fetch to Worker",
        () =>
          document.querySelector("#api")?.textContent ===
          state.framework + " API ready",
      );
      await check(
        "stylesheet",
        () =>
          getComputedStyle(document.querySelector("#styled")).color ===
          "rgb(23, 101, 43)",
      );
      await check(
        "image",
        () => document.querySelector("img")?.naturalWidth === 16,
      );
      window.documentSentinel = true;
      next(() => document.querySelector("a").click());
    } else if (state.step === 1) {
      await check(
        "link creates new Window",
        () => location.pathname === "/pages/second" && !window.documentSentinel,
      );
      next(() => document.querySelector("a").click());
    } else if (state.step === 2 || state.step === 3) {
      await check(
        state.step === 2
          ? "module initializes on ordinary revisit"
          : "module initializes after reload",
        () =>
          document.querySelector("#module")?.textContent === "module ready" &&
          document.querySelector("#api")?.textContent ===
            state.framework + " API ready",
      );
      if (state.step === 2) next(() => location.reload());
      else next(() => document.querySelector("a").click());
    } else if (state.step === 4) {
      await check(
        "second page before back",
        () => location.pathname === "/pages/second",
      );
      next(() => history.back());
    } else if (state.step === 5) {
      await check("back", () => location.pathname === "/pages/home");
      next(() => history.forward());
    } else if (state.step === 6) {
      await check("forward", () => location.pathname === "/pages/second");
      document.querySelector("input").value = "日本語 & <tag>";
      next(() => document.querySelector("form").requestSubmit());
    } else if (state.step === 7) {
      await check(
        "GET form URL and escaping",
        () =>
          new URL(location.href).searchParams.get("q") === "日本語 & <tag>" &&
          document.querySelector("#query")?.textContent === "日本語 & <tag>",
      );
      next(() => location.assign("/pages/generated"));
    } else if (state.step === 8) {
      await check(
        "Worker-generated script resource",
        () =>
          document.querySelector("#generated")?.textContent ===
          "Worker script ready",
      );
      next(() => location.assign("/pages/forms"));
    } else if (state.step === 9) {
      await check("POST form page", () => !!document.querySelector("form"));
      next(() =>
        document
          .querySelector("form")
          .requestSubmit(document.querySelector("button")),
      );
    } else if (state.step === 10) {
      await check("native POST body + submitter", () => {
        const value = JSON.parse(
          document.querySelector("#payload")?.textContent || "null",
        );
        return (
          value?.method === "POST" &&
          JSON.stringify(value.fields) ===
            JSON.stringify([
              ["message", "日本語 & <tag>"],
              ["duplicate", "one"],
              ["duplicate", "two"],
              ["action", "save"],
            ])
        );
      });
      next(() => location.assign("/pages/redirect/302"));
    } else if (state.step === 11) {
      await check(
        "native document redirect URL",
        () =>
          location.pathname === "/pages/echo" && location.search === "?via=302",
      );
      next(() => location.assign("/pages/forms"));
    } else if (state.step >= 12 && state.step < 27) {
      const status = [301, 302, 303, 307, 308][
        Math.floor((state.step - 12) / 3)
      ];
      const phase = (state.step - 12) % 3;
      if (phase === 0) {
        await check(
          `form before ${status}`,
          () => location.pathname === "/pages/forms",
        );
        document.querySelector("form").action = `/pages/redirect/${status}`;
        next(() =>
          document
            .querySelector("form")
            .requestSubmit(document.querySelector("button")),
        );
      } else if (phase === 1) {
        await check(`${status} document URL + method + body`, () => {
          const value = JSON.parse(
            document.querySelector("#payload")?.textContent || "null",
          );
          return (
            location.pathname === "/pages/echo" &&
            location.search === `?via=${status}` &&
            value?.method === (status >= 307 ? "POST" : "GET") &&
            JSON.stringify(value.fields) ===
              JSON.stringify(
                status >= 307
                  ? [
                      ["message", "日本語 & <tag>"],
                      ["duplicate", "one"],
                      ["duplicate", "two"],
                      ["action", "save"],
                    ]
                  : [],
              )
          );
        });
        next(() => history.back());
      } else {
        await check(
          `${status} back skips redirect response`,
          () => location.pathname === "/pages/forms",
        );
        next(() => location.assign("/pages/forms"));
      }
    } else if (state.step === 27) {
      for (const status of [301, 302, 303, 307, 308]) {
        const response = await fetch(`/api/redirect/${status}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: "日本語" }),
        });
        const value = await response.json();
        await check(
          `${status} API method + JSON body`,
          () =>
            value.method === (status >= 307 ? "POST" : "GET") &&
            value.text ===
              (status >= 307 ? JSON.stringify({ text: "日本語" }) : ""),
        );
      }
      if (window.documentNativeFetch) {
        for (const status of [301, 302, 303, 307, 308]) {
          const url = `/api/redirect/${status}`;
          const followed = await fetch(url, { method: "POST", body: "body" });
          const cloned = followed.clone();
          await check(
            `${status} fetch final metadata + clone`,
            () =>
              followed.url ===
                new URL(`/api/echo?via=${status}`, location.href).href &&
              followed.redirected &&
              cloned.url === followed.url &&
              cloned.redirected &&
              followed.type === "basic",
          );
          const manual = await fetch(url, { redirect: "manual" });
          const manualClone = manual.clone();
          await check(
            `${status} fetch manual opaque response`,
            () =>
              manual.status === 0 &&
              manual.type === "opaqueredirect" &&
              manual.body === null &&
              [...manual.headers].length === 0 &&
              !manual.redirected &&
              manualClone.type === "opaqueredirect",
          );
          let rejected = false;
          try {
            await fetch(
              new Request(new URL(url, location.href), { redirect: "error" }),
            );
          } catch (error) {
            rejected = error instanceof TypeError;
          }
          await check(`${status} fetch error rejects`, () => rejected);
        }
      }
      const data = new FormData();
      data.append("message", "日本語");
      data.append(
        "upload",
        new File([new Uint8Array([0, 1, 128, 255])], "bytes.bin", {
          type: "application/octet-stream",
        }),
      );
      if (window.documentNativeFetch) {
        const encoded = new Request("https://worker.invalid/api/echo", {
          method: "POST",
          body: data,
        });
        const bytes = new Uint8Array(await encoded.arrayBuffer());
        state.diagnostics = [];
        for (const [name, body, headers] of [
          ["native FormData", data, undefined],
          [
            "native encoded Blob",
            new Blob([bytes], { type: encoded.headers.get("content-type") }),
            undefined,
          ],
          ["native encoded bytes", bytes, Object.fromEntries(encoded.headers)],
          [
            "script bridge encoded bytes",
            bytes,
            Object.fromEntries(encoded.headers),
          ],
        ]) {
          const send = name.startsWith("script")
            ? fetch
            : window.documentNativeFetch;
          const response = await send("/api/echo?raw=1", {
            method: "POST",
            body,
            headers,
          });
          const value = await response.json();
          state.diagnostics.push({
            name,
            expectedEncodedBytes: bytes.length,
            schemeBytes: response.headers.get("x-native-request-body-bytes"),
            workerBytes: value.bytes.length,
            exactBytes:
              JSON.stringify(value.bytes) === JSON.stringify([...bytes]),
          });
        }
        save();
      }
      const multipartResponse = await fetch("/api/echo", {
        method: "POST",
        body: data,
      });
      const multipartText = await multipartResponse.text();
      let multipart;
      try {
        multipart = JSON.parse(multipartText);
      } catch {
        /* Report the native transport's actual body below. */
      }
      const multipartOK =
        JSON.stringify(multipart?.fields) ===
        JSON.stringify([
          ["message", "日本語"],
          [
            "upload",
            {
              name: "bytes.bin",
              type: "application/octet-stream",
              bytes: [0, 1, 128, 255],
            },
          ],
        ]);
      state.cases.push({
        name: "multipart file bytes",
        passed: multipartOK,
        ...(multipartOK
          ? {}
          : {
              error: `HTTP ${multipartResponse.status}: ${multipartText.slice(0, 500)}`,
            }),
      });
      save();
      await check("Capacitor bridge exists after navigation", () =>
        window.Capacitor?.isNativePlatform(),
      );
      await Promise.race([
        window.Capacitor.nativePromise("CapacitorCookies", "getCookies", {
          url: "https://worker.invalid",
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Native plugin timeout")), 10000),
        ),
      ]);
      state.cases.push({ name: "native plugin round trip", passed: true });
      next(() => location.assign("/pages/forms?upload=direct"));
    } else if (state.step >= 28 && state.step < 40) {
      const status = [0, 307, 308, -1][Math.floor((state.step - 28) / 3)];
      const phase = (state.step - 28) % 3;
      if (phase === 0) {
        const form = document.querySelector("#upload-form");
        const files = new DataTransfer();
        files.items.add(
          new File([new Uint8Array([0, 1, 128, 255])], "bytes.bin", {
            type: "application/octet-stream",
          }),
        );
        form.querySelector('input[type="file"]').files = files.files;
        if (status === 307)
          form
            .querySelector("button")
            .setAttribute("formaction", `/pages/redirect/${status}`);
        else if (status === 308) form.action = `/pages/redirect/${status}`;
        form.addEventListener("formdata", (event) =>
          event.formData.set("message", "updated 日本語"),
        );
        window.uploadSentinel = true;
        next(() =>
          status === -1
            ? form.submit()
            : form.requestSubmit(form.querySelector("button")),
        );
      } else if (phase === 1) {
        await check(
          `${status || "direct"} file form native navigation + bytes + submitter`,
          () => {
            const value = JSON.parse(
              document.querySelector("#payload")?.textContent || "null",
            );
            return (
              !window.uploadSentinel &&
              location.pathname === "/pages/echo" &&
              value?.method === "POST" &&
              JSON.stringify(value.fields) ===
                JSON.stringify([
                  ["message", "updated 日本語"],
                  [
                    "upload",
                    {
                      name: "bytes.bin",
                      type: "application/octet-stream",
                      bytes: [0, 1, 128, 255],
                    },
                  ],
                  ...(status === -1 ? [] : [["action", "upload"]]),
                ])
            );
          },
        );
        next(() => history.back());
      } else {
        await check(
          `${status || "direct"} file form back history`,
          () => location.pathname === "/pages/forms",
        );
        next(() => location.assign(`/pages/forms?upload=${state.step}`));
      }
    } else if (state.step === 40) {
      state.step++;
      save();
      report();
      if (location.protocol === "https:" && navigator.serviceWorker) {
        for (const registration of await navigator.serviceWorker.getRegistrations())
          await registration.unregister();
      }
    }
  } catch (error) {
    state.cases.push({ name: String(error), passed: false });
    save();
    report();
  }
}
window.addEventListener("pageshow", (event) => {
  if (event.persisted) runDocumentProbe();
});
runDocumentProbe();
