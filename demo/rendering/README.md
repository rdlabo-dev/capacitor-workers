# Worker-rendered native pages

`main.ts` starts `capacitorWorkers({ baseURL, render: '/' })`. The selected Worker
returns the whole document. `workers/hono.tsx` and `workers/express.ts` each own
page routes, POST/redirect handling and the JSON API.

Select the Worker in `vite.config.ts`. From `demo/`, build with:

```sh
npm run build:rendering
```

This writes the native web assets to `demo/dist`. The native source integration
is implemented, but automatic plugin packaging is deferred: `cap sync` alone
does not yet install it. The repository's `tests/` wiring compiles the native
sources directly for validation; this is not a consumer installation procedure.
See [the source API guide](../../docs/native-rendering-api.md).

The application code here contains no test driver. Full native acceptance tests
use the same public startup API in `tests/fixtures/apps/public-documents`.
