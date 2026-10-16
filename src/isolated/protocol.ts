export interface Invocation {
  port: MessagePort;
  url: string;
  method: string;
  headers: [string, string][];
  body: ArrayBuffer | null;
  env: unknown;
}
export type Command = "pull" | "cancel" | "abort";
export type Reply =
  | {
      type: "response";
      status: number;
      statusText: string;
      headers: [string, string][];
      hasBody: boolean;
    }
  | { type: "chunk"; value: Uint8Array }
  | { type: "end" }
  | { type: "error"; name: string; message: string }
  | { type: "done"; errors: string[] };
