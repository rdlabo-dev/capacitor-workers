import { createNetworkFixture } from "../fixtures/network/server.mjs";
const server = createNetworkFixture();
server.listen(4201, "0.0.0.0", () =>
  console.log("Native network fixture listening on port 4201"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.closeAllConnections();
    server.close();
  });
