import { Hono } from "hono";

const app = new Hono();
app.get("/", (c) =>
  c.html(
    `<main><h1>Hello from Hono</h1><p>This HTML was rendered by the Worker.</p></main>`,
  ),
);
app.get("/api/hello", (c) =>
  c.json({ message: "Hello from Workers", name: c.req.query("name") ?? null }),
);

export default app;
