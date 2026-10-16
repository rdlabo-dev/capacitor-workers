/** A complete Workers Express page, with no Capacitor-specific application code. */
import express from "express";
import { httpServerHandler } from "cloudflare:node";
import { forms, describeRequest, echoPage } from "./requests";
const app = express();
app.use(express.raw({ type: "*/*" }));
app.get("/pages/home", (_req, res) =>
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Express document</title>
<link rel="stylesheet" href="../rendering/style.css">
</head>
<body>
<h1>Hello from Express</h1>
<p id="styled">External stylesheet</p>
<p id="inline">Waiting</p>
<p id="classic">Waiting</p>
<p id="module">Waiting</p>
<p id="api">Waiting</p>
<img src="../rendering/pixel.svg" alt="Relative asset">
<a href="./second">Next page</a>
<script>document.querySelector("#inline").textContent = "inline ready";</script>
<script src="../rendering/classic.js"></script>
<script type="module" src="../rendering/module.js"></script>
</body>
</html>`),
);
app.get("/pages/second", (_req, res) =>
  res.type("html").send(`<!doctype html>
<html lang="en"><head><title>Express second page</title></head><body>
<h1>Express second page</h1><a href="./home">Home</a>
<form action="./search" method="get"><input name="q" aria-label="Search"><button>Search</button></form>
</body></html>`),
);
app.get("/pages/search", (req, res) => {
  const query = String(req.query.q ?? "").replace(
    /[&<>"']/g,
    (value) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        value
      ]!,
  );
  res
    .type("html")
    .send(
      `<!doctype html><html><head><title>Search</title></head><body><h1>Search</h1><p id="query">${query}</p></body></html>`,
    );
});
app.get("/api/message", (_req, res) =>
  res.json({ message: "Express API ready" }),
);
app.get("/pages/generated", (_req, res) =>
  res
    .type("html")
    .send(
      '<!doctype html><html><head><title>Generated resource</title></head><body><p id="generated">Waiting</p><script src="../api/generated.js"></script></body></html>',
    ),
);
app.get("/api/generated.js", (_req, res) =>
  res
    .type("js")
    .send(
      'document.querySelector("#generated").textContent = "Worker script ready";',
    ),
);
app.get("/pages/forms", (_req, res) => res.type("html").send(forms));
app.all(["/pages/echo", "/api/echo"], async (req, res) => {
  const request = new Request("https://worker.invalid" + req.originalUrl, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
  });
  const value = await describeRequest(request);
  if (req.path.startsWith("/api/")) res.json(value);
  else res.type("html").send(echoPage(value));
});
app.all(["/pages/redirect/:status", "/api/redirect/:status"], (req, res) =>
  res.redirect(Number(req.params.status), "../echo?via=" + req.params.status),
);
app.listen(3000);
export default httpServerHandler({ port: 3000 });
