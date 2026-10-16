declare module "upstream-worker" {
  const worker: {
    fetch(
      request: Request,
      env: unknown,
      ctx: unknown,
    ): Response | Promise<Response>;
  };
  export default worker;
}
