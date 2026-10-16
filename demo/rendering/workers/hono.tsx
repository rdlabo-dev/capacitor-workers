/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { html } from "hono/html";
const app = new Hono();
app.get("/", (c) =>
  c.html(
    html`<!doctype html>${(
        <html lang="en">
          <head>
            <title>Hono in Capacitor</title>
          </head>
          <body>
            <h1>Hono in Capacitor</h1>
            <a href="/about">About</a>
            <form action="/greet" method="post">
              <label>
                Name <input name="name" required />
              </label>
              <button>Greet</button>
            </form>
          </body>
        </html>
      )}`,
  ),
);
app.get("/about", (c) =>
  c.html(
    html`<!doctype html>${(
        <html>
          <head>
            <title>About</title>
          </head>
          <body>
            <h1>Rendered by Hono TSX</h1>
            <a href="/">Home</a>
          </body>
        </html>
      )}`,
  ),
);
app.post("/greet", async (c) => {
  const form = await c.req.formData();
  return c.redirect(
    "/hello?name=" + encodeURIComponent(String(form.get("name") ?? "")),
    303,
  );
});
app.get("/hello", (c) =>
  c.html(
    html`<!doctype html>${(
        <html>
          <head>
            <title>Hello</title>
          </head>
          <body>
            <h1>Hello, {c.req.query("name")}</h1>
            <a href="/">Home</a>
          </body>
        </html>
      )}`,
  ),
);
app.get("/api/hello", (c) => c.json({ message: "Hello from Hono" }));
export default app;
