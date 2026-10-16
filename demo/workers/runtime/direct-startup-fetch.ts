// Regression fixture: this must reject explicitly instead of deadlocking startup.
await fetch("/api/bootstrap");
export default { fetch: () => new Response("initialized") };
