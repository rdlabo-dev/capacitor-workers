# Earlier Turbo rendering experiment

**Historical record: implementation and dependencies removed.** The current direction is [native Worker document loading](document-rendering.md).

## What was tested

An earlier experiment placed Turbo Drive between the visible page and the existing Fetch Adapter. Hono/TSX and Workers Express returned complete HTML documents; Turbo merged the head, replaced the body, and managed URLs and history in the same Window. No iframe was used.

Initial documents, inline/classic/module scripts, bundled assets, API calls, links, history, and GET forms were demonstrated. Constructed Worker Responses have an empty `Response.url`, so a test-only annotation was required for Turbo's GET-form location handling.

## Why it was not adopted

The intended behavior is for the framework's HTML Response to become a normal WebView document. Turbo instead introduces its own navigation lifecycle.

In both Chromium and WebKit, Next page → Home through ordinary links did not evaluate the external ES module again. Newly rendered module/API markers remained `Waiting`. The same HTML worked on initial load; ordinary revisit did not initialize the page. Adapting every application's initialization to Turbo would depart from the minimal-change goal.

The earlier browser suite passed 12 tests, including four tests that deliberately confirmed this incompatibility. Earlier native runs passed 14 checks per framework on iOS 26.1 and Android 16, but did not check ordinary-link module reinitialization. Those results therefore did not establish arbitrary application compatibility.

Turbo-specific fixtures, scripts, dependencies, and CI steps have been removed. The shared Hono/Express document fixtures remain for the native investigation. No Turbo API or dependency was added to the published library.

Reference: [Turbo Drive's navigation model](https://turbo.hotwired.dev/handbook/drive).
