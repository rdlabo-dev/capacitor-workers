export const kSetIncomingBody = Symbol("setIncomingBody");
export const kSetIncomingFetchResponse = Symbol("setIncomingFetchResponse");
export const kSetIncomingSocket = Symbol("setIncomingSocket");

export interface InboundSocket {
  opened: Promise<{ localAddress?: string | null }>;
}

export interface LogicalPortHandler {
  server?: unknown;
  createRequestResponse?: () => unknown;
  fetch?: (request: Request, env?: unknown, ctx?: unknown) => Promise<Response>;
  connect?: (
    socket: InboundSocket,
    env?: unknown,
    ctx?: unknown,
  ) => Promise<void>;
}

const handlers = new Map<number, LogicalPortHandler>();
let nextPort = 49152;

export function getHandler(port: number): LogicalPortHandler | undefined {
  return handlers.get(port);
}

export function setHandler(port: number, handler: LogicalPortHandler): void {
  handlers.set(port, handler);
}

export function release(port: number): void {
  handlers.delete(port);
}

export function hasHandler(port: number): boolean {
  return handlers.has(port);
}

export function ephemeral(): number {
  const start = nextPort;
  while (handlers.has(nextPort)) {
    nextPort = nextPort === 65535 ? 49152 : nextPort + 1;
    if (nextPort === start) return 0;
  }
  const port = nextPort;
  nextPort = nextPort === 65535 ? 49152 : nextPort + 1;
  return port;
}
