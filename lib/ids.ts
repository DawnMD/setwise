/**
 * Client-generated row ids.
 *
 * The set the user just saved is named before it is sent, so a retry after a
 * lost response is recognisably the same request rather than a second identical
 * set. Everything the app generates this way is a v4 UUID, because that is what
 * the columns are.
 */
export function newId(): string {
  const globalCrypto = globalThis.crypto;

  if (typeof globalCrypto?.randomUUID === "function") {
    return globalCrypto.randomUUID();
  }

  // Safari before 15.4 and any non-secure context. `getRandomValues` is far
  // older than `randomUUID`, so this only has to assemble the bytes.
  const bytes = new Uint8Array(16);
  globalCrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
