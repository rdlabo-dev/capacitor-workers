import worker from "../../workers/runtime/isolation";

// Experiment only: buffered upload, transferable response stream, explicit abort channel.
self.onmessage = async ({ data }) => {
  const { port, url, method, headers, body, env } = data as {
    port: MessagePort;
    url: string;
    method: string;
    headers: [string, string][];
    body: ArrayBuffer | null;
    env: { UPSTREAM: string };
  };
  const controller = new AbortController();
  port.onmessage = ({ data }) => {
    if (data === "abort") controller.abort();
  };
  const pending: Promise<unknown>[] = [];
  const errors: string[] = [];
  try {
    const request = new Request(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const response = await worker.fetch(request, env, {
      waitUntil(promise) {
        pending.push(
          promise.catch((error) => {
            errors.push(String(error));
          }),
        );
      },
    });
    port.postMessage(
      {
        type: "response",
        status: response.status,
        headers: [...response.headers],
        body: response.body,
      },
      response.body ? [response.body] : [],
    );
  } catch (error) {
    port.postMessage({
      type: "error",
      name: (error as Error).name,
      message: String(error),
    });
  } finally {
    while (pending.length) await Promise.all(pending.splice(0));
    port.postMessage({ type: "done", errors });
  }
};
