import { runNodeContracts } from "../../../validation/node-modules";

// Runs the node contracts inside the configured Worker bundle so bundled
// resolution and Dedicated Worker execution are covered without relying on
// bundler-specific Worker entry transforms.
export default {
  async fetch() {
    return Response.json(await runNodeContracts("bundled"));
  },
};
