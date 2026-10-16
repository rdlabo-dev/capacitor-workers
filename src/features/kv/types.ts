export type KVReadType = "text" | "json" | "arrayBuffer" | "stream";
export interface KVReadOptions<T extends KVReadType = KVReadType> {
  type?: T;
  cacheTtl?: number;
}
export interface KVPutOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: unknown;
}
export interface KVListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}
export interface KVValue<T, M = unknown> {
  value: T | null;
  metadata: M | null;
}
export interface KVKey<M = unknown> {
  name: string;
  expiration?: number;
  metadata?: M;
}
export type KVListResult<M = unknown> = {
  keys: KVKey<M>[];
} & ({ list_complete: true } | { list_complete: false; cursor: string });
