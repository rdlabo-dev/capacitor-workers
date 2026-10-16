import { Hono } from "hono";
const app = new Hono();
app.use("/api/*", async (c, next) => {
  await next();
  c.header("x-framework", "hono");
});
app.get("/api/hello", (c) =>
  c.json({ message: "Hello from Workers", name: c.req.query("name") ?? null }),
);
app.post("/api/echo", async (c) => c.json(await c.req.json(), 201));
app.get("/api/items/:id", (c) => c.json({ id: c.req.param("id") }));
app.get("/api/url", (c) => c.json({ url: c.req.url }));
app.get("/api/empty", (c) => c.body(null, 204));
app.get("/api/error", () => {
  throw new Error("expected failure");
});
app.onError((_error, c) => c.json({ error: "expected failure" }, 500));
export default app;
