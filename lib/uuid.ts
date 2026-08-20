/**
 * UUIDv7, generated on whichever side is writing.
 *
 * The set id has to come from the client, because it is what makes a retry
 * idempotent. That matters most in exactly the case a phone in a gym produces:
 * the request times out, the user has no idea whether it saved, they tap again.
 * With a client id the second tap is a no-op; with a server id it is a duplicate
 * set quietly corrupting their volume numbers.
 *
 * Version 7 rather than `crypto.randomUUID`'s version 4 because the first 48
 * bits are a millisecond timestamp, so ids sort by creation time. That keeps
 * primary-key inserts appending to the end of the btree instead of scattering.
 */

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

let lastMs = 0;
let counter = 0;

/** The counter is 12 bits, seeded in the bottom quarter so it has room to run. */
const COUNTER_MAX = 0xfff;
const COUNTER_SEED_MASK = 0x3ff;

/**
 * Within a single millisecond the random bits alone would order ids randomly, so
 * the 12 bits after the version act as a monotonic counter. Two sets logged in
 * the same millisecond is not a real scenario, but "ids sort by creation time"
 * is only worth claiming if it is true.
 *
 * Which is why the seed is masked to the bottom quarter of the range and the
 * counter borrows a millisecond rather than wrapping. Seeding across the whole
 * 12 bits leaves an id minted near 0xfff to roll over to zero inside the same
 * millisecond, and the id after it then sorts before it. RFC 9562 calls this
 * the rollover guard.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  let ms = Date.now();
  if (ms <= lastMs) {
    // Also covers a clock that stepped backwards: the ids stay ordered, at the
    // cost of running slightly ahead of the wall clock until it catches up.
    ms = lastMs;
    counter += 1;
    if (counter > COUNTER_MAX) {
      ms = lastMs + 1;
      lastMs = ms;
      counter = ((bytes[6] << 8) | bytes[7]) & COUNTER_SEED_MASK;
    }
  } else {
    lastMs = ms;
    counter = ((bytes[6] << 8) | bytes[7]) & COUNTER_SEED_MASK;
  }

  // 48-bit timestamp. Split with division rather than shifts: `>>>` truncates to
  // 32 bits, and Date.now() has outgrown that since 1970 + 49 days.
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = (ms >>> 16) & 0xff;
  bytes[4] = (ms >>> 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = 0x70 | ((counter >>> 8) & 0x0f); // version 7 + counter high nibble
  bytes[7] = counter & 0xff;
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant

  return (
    HEX[bytes[0]] +
    HEX[bytes[1]] +
    HEX[bytes[2]] +
    HEX[bytes[3]] +
    "-" +
    HEX[bytes[4]] +
    HEX[bytes[5]] +
    "-" +
    HEX[bytes[6]] +
    HEX[bytes[7]] +
    "-" +
    HEX[bytes[8]] +
    HEX[bytes[9]] +
    "-" +
    HEX[bytes[10]] +
    HEX[bytes[11]] +
    HEX[bytes[12]] +
    HEX[bytes[13]] +
    HEX[bytes[14]] +
    HEX[bytes[15]]
  );
}

/** The millisecond a v7 id was minted. Used by the export, not by the app. */
export function uuidv7Timestamp(id: string): number | null {
  const hex = id.replace(/-/g, "");
  if (hex.length !== 32 || hex[12] !== "7") return null;
  return parseInt(hex.slice(0, 12), 16);
}
