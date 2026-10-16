/** A complete Hono/TSX page, with no Capacitor-specific application code. */
/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { html } from "hono/html";
import { forms, describeRequest, echoPage } from "./requests";
const app = new Hono();
app.get("/pages/home", (c) =>
  c.html(
    html`<!doctype html>${(
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <title>Hono document</title>
            <link rel="stylesheet" href="../rendering/style.css" />
          </head>
          <body>
            <h1>Hello from Hono TSX</h1>
            <p id="styled">External stylesheet</p>
            <p id="inline">Waiting</p>
            <p id="classic">Waiting</p>
            <p id="module">Waiting</p>
            <p id="api">Waiting</p>
            <img src="../rendering/pixel.svg" alt="Relative asset" />
            <a href="./second">Next page</a>
            <script
              dangerouslySetInnerHTML={{
                __html:
                  'document.querySelector("#inline").textContent = "inline ready";',
              }}
            />
            <script src="../rendering/classic.js" />
            <script type="module" src="../rendering/module.js" />
          </body>
        </html>
      )}`,
  ),
);
app.get("/pages/second", (c) =>
  c.html(
    html`<!doctype html>${(
        <html lang="en">
          <head>
            <title>Hono second page</title>
          </head>
          <body>
            <h1>Hono second page</h1>
            <a href="./home">Home</a>
            <form action="./search" method="get">
              <input name="q" aria-label="Search" />
              <button>Search</button>
            </form>
          </body>
        </html>
      )}`,
  ),
);
app.get("/pages/search", (c) =>
  c.html(
    html`<!doctype html>${(
        <html>
          <head>
            <title>Search</title>
          </head>
          <body>
            <h1>Search</h1>
            <p id="query">{c.req.query("q")}</p>
          </body>
        </html>
      )}`,
  ),
);
app.get("/api/message", (c) => c.json({ message: "Hono API ready" }));
app.get("/pages/generated", (c) =>
  c.html(
    '<!doctype html><html><head><title>Generated resource</title></head><body><p id="generated">Waiting</p><script src="../api/generated.js"></script></body></html>',
  ),
);
app.get("/api/generated.js", (c) =>
  c.body(
    'document.querySelector("#generated").textContent = "Worker script ready";',
    200,
    { "Content-Type": "text/javascript" },
  ),
);
app.get("/pages/forms", (c) => c.html(forms));
app.all("/pages/echo", async (c) =>
  c.html(echoPage(await describeRequest(c.req.raw))),
);
app.all("/api/echo", async (c) => c.json(await describeRequest(c.req.raw)));
app.all("/pages/redirect/:status", (c) =>
  c.redirect(
    "../echo?via=" + c.req.param("status"),
    Number(c.req.param("status")) as 301 | 302 | 303 | 307 | 308,
  ),
);
app.all("/api/redirect/:status", (c) =>
  c.redirect(
    "../echo?via=" + c.req.param("status"),
    Number(c.req.param("status")) as 301 | 302 | 303 | 307 | 308,
  ),
);
export default app;
