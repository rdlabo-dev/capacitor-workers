export const documentConfig = (
  globalThis as typeof globalThis & {
    __capacitorWorkersDocuments: { baseURL: string; assets: string[] };
  }
).__capacitorWorkersDocuments;
export function isDocumentURL(url: URL) {
  return (
    !documentConfig.assets.includes(url.pathname) &&
    !url.pathname.startsWith("/_capacitor_")
  );
}
