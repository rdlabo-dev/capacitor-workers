import { LocalStorageKV } from "@rdlabo/capacitor-workers/features/kv";
import { openFeature } from "@rdlabo/capacitor-workers/features";
import { FetchImplementation } from "@rdlabo/capacitor-workers/features/fetch";
import worker from "../workers/features/kv";
export async function kvRequest(
  namespace: string,
  method: string,
  body?: string,
) {
  const kv = await openFeature(new LocalStorageKV(namespace));
  try {
    const runtime = await openFeature(
      new FetchImplementation({
        worker,
        baseURL: "https://worker.invalid",
        env: { KV: kv.api },
      }),
    );
    try {
      const response = await runtime.api("https://worker.invalid/kv", {
        method,
        body,
      });
      return { status: response.status, body: await response.text() };
    } finally {
      await runtime.dispose();
    }
  } finally {
    await kv.dispose();
  }
}
export async function verifyKVPersistence() {
  const namespace = `persistence-${crypto.randomUUID()}`;
  try {
    const put = await kvRequest(namespace, "PUT", "日本語 🍷");
    const get = await kvRequest(namespace, "GET");
    if (put.status !== 204 || get.status !== 200 || get.body !== "日本語 🍷")
      throw new Error("KV did not survive feature disposal and recreation");
  } finally {
    await kvRequest(namespace, "DELETE");
  }
}
