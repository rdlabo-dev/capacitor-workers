import { Hono } from "hono";

const app = new Hono();
app.get("/api/hello", (c) =>
  c.json({ message: "Hello from Workers", name: c.req.query("name") ?? null }),
);

export default app;
