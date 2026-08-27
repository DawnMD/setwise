/**
 * Client-generated row ids.
 *
 * The set the user just saved is named before it is sent, so a retry after a
 * lost response is recognisably the same request rather than a second identical
 * set. Everything the app generates this way is a v4 UUID, because that is what
 * the columns are.
 */

/**
 * The Web Crypto surface this file uses, declared rather than imported.
 *
 * `globalThis.crypto` is typed by `lib.dom` and by `@types/node`, and this
 * package may load neither: it compiles against `esnext` alone so nothing here
 * can quietly start depending on a browser or a Node runtime. Both entry points
 * are standard and present on every platform the app targets — with the caveat
 * that React Native supplies neither until the application installs a polyfill,
 * which is why `randomUUID` is probed rather than assumed.
 */
type WebCrypto = {
  randomUUID?: () => string;
  getRandomValues: (array: Uint8Array) => Uint8Array;
};

export function newId(): string {
  const globalCrypto = (globalThis as { crypto?: WebCrypto }).crypto;

  if (typeof globalCrypto?.randomUUID === "function") {
    return globalCrypto.randomUUID();
  }

  if (!globalCrypto) {
    throw new Error("No Web Crypto implementation is available to generate an id.");
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
