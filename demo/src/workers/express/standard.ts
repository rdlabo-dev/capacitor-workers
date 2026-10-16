import express from "express";
import { httpServerHandler } from "cloudflare:node";

const app = express();
app.get("/api/hello", (req, res) =>
  res.json({ message: "Hello from Workers", name: req.query.name ?? null }),
);

app.listen(3000);
export default httpServerHandler({ port: 3000 });
