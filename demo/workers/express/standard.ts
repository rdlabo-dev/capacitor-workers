import express from "express";
import { httpServerHandler } from "cloudflare:node";
const app = express();
app.use((_req, res, next) => {
  res.setHeader("x-framework", "express");
  next();
});
app.use(express.json());
app.get("/api/hello", (req, res) =>
  res.json({ message: "Hello from Workers", name: req.query.name ?? null }),
);
app.post("/api/echo", (req, res) => res.status(201).json(req.body));
const router = express.Router();
router.get("/:id", (req, res) => res.json({ id: req.params.id }));
app.use("/api/items", router);
app.get("/api/url", (req, res) =>
  res.json({ url: `${req.protocol}://${req.get("host")}${req.originalUrl}` }),
);
app.get("/api/empty", (_req, res) => res.status(204).end());
app.get("/api/error", async () => {
  throw new Error("expected failure");
});
app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(500).json({ error: error.message });
  },
);
app.listen(3000);
export default httpServerHandler({ port: 3000 });
