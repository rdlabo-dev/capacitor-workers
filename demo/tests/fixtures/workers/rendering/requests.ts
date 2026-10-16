/** Shared fixture data; no Capacitor imports or browser interception logic. */
export const forms = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forms</title></head><body>
<form action="./echo" method="post"><input name="message" value="日本語 &amp; &lt;tag&gt;"><input name="duplicate" value="one"><input name="duplicate" value="two"><input name="disabled" disabled value="skip"><button name="action" value="save">Save</button></form>
<form id="upload-form" action="./echo" method="post" enctype="multipart/form-data"><input name="message" value="日本語"><input name="upload" type="file"><button name="action" value="upload">Upload</button></form>
<a href="./redirect/302">Redirect</a></body></html>`;
export async function describeRequest(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  const fields: [
    string,
    string | { name: string; type: string; bytes: number[] },
  ][] = [];
  let text = "";
  if (new URL(request.url).searchParams.has("raw"))
    return {
      method: request.method,
      fields,
      text,
      query: new URL(request.url).search,
      bytes: Array.from(new Uint8Array(await request.arrayBuffer())),
      contentType: type,
    };
  if (!["GET", "HEAD"].includes(request.method)) {
    if (/multipart\/form-data|application\/x-www-form-urlencoded/.test(type)) {
      for (const [name, value] of await request.formData())
        fields.push([
          name,
          typeof value === "string"
            ? value
            : {
                name: value.name,
                type: value.type,
                bytes: Array.from(new Uint8Array(await value.arrayBuffer())),
              },
        ]);
    } else text = await request.text();
  }
  return {
    method: request.method,
    fields,
    text,
    query: new URL(request.url).search,
  };
}
export function echoPage(value: unknown) {
  const escaped = JSON.stringify(value).replace(
    /[&<>]/g,
    (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value]!,
  );
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Echo</title></head><body><pre id="payload">${escaped}</pre><a href="./forms">Forms</a></body></html>`;
}
