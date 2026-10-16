// A real dynamically imported entry with top-level await, not a mock loader.
await fetch("https://test/api/bootstrap");
export default { fetch: () => new Response("initialized") };
