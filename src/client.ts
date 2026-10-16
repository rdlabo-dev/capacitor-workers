declare module "*?capacitor-worker" {
  const worker: import("./index.js").WorkerFactory;
  export default worker;
}

/** Include @rdlabo/capacitor-workers/client in compiler types. */
declare module "virtual:capacitor-workers" {
  const source: import("./index.js").WorkerSource<any>;
  export default source;
}
