declare module "*?capacitor-worker" {
  const worker: import("./index.js").WorkerFactory;
  export default worker;
}
