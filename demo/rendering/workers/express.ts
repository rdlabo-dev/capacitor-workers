import express from "express";
import { httpServerHandler } from "cloudflare:node";
const app = express();
app.use(express.urlencoded({ extended: false }));
app.get("/", (_req, res) =>
  res.type("html")
    .send(`<!doctype html><html><head><title>Express in Capacitor</title></head><body>
<h1>Express in Capacitor</h1><a href="/about">About</a>
<form action="/greet" method="post"><label>Name <input name="name" required></label><button>Greet</button></form>
</body></html>`),
);
app.get("/about", (_req, res) =>
  res
    .type("html")
    .send(
      '<!doctype html><html><head><title>About</title></head><body><h1>Rendered by Workers Express</h1><a href="/">Home</a></body></html>',
    ),
);
app.post("/greet", (req, res) =>
  res.redirect(
    303,
    "/hello?name=" + encodeURIComponent(String(req.body.name ?? "")),
  ),
);
app.get("/hello", (req, res) => {
  const name = String(req.query.name ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
  res
    .type("html")
    .send(
      `<!doctype html><html><head><title>Hello</title></head><body><h1>Hello, ${name}</h1><a href="/">Home</a></body></html>`,
    );
});
app.get("/api/hello", (_req, res) =>
  res.json({ message: "Hello from Workers Express" }),
);
app.listen(3000);
export default httpServerHandler({ port: 3000 });
