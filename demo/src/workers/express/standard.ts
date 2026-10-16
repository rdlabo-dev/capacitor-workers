import express from "express";
import { httpServerHandler } from "cloudflare:node";

const app = express();
app.get("/", (_req, res) =>
  res
    .type("html")
    .send(
      `<main><h1>Hello from Express</h1><p>This HTML was rendered by the Worker.</p></main>`,
    ),
);
app.get("/api/hello", (req, res) =>
  res.json({ message: "Hello from Workers", name: req.query.name ?? null }),
);

app.listen(3000);
export default httpServerHandler({ port: 3000 });
