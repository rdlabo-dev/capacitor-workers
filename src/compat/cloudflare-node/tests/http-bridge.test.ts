import { expect, it } from "vitest";
import { createServer } from "../../http/index";
import { httpServerHandler } from "../index";

it("rejects invalid asynchronous response headers instead of leaving fetch pending", async () => {
  const server = createServer((_request, response) => {
    setTimeout(() => {
      response.setHeader("bad\nname", "value");
      response.end("body");
    }, 0);
  }).listen(3019);
  try {
    await expect(
      httpServerHandler({ port: 3019 }).fetch(
        new Request("https://example.test/"),
      ),
    ).rejects.toThrow();
  } finally {
    server.close();
  }
});
