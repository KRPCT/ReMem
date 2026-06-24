import "server-only";

// URL-safe alphabet (no look-alike-prone separators needed — this is an
// opaque token, not a human-typed code). 62 symbols.
const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generate an opaque, hard-to-guess deck share token. 22 chars over a
 * 62-symbol alphabet is ~130 bits of entropy — not enumerable. Uses Web
 * Crypto (`crypto.getRandomValues`), available in both the Node
 * serverless and edge runtimes, so the caller stays runtime-agnostic.
 *
 * Modulo bias across 62 symbols on a 0-255 byte is negligible for a
 * share token (the goal is unguessability + uniqueness, not uniform
 * cryptographic sampling), and the Deck.shareToken @unique constraint
 * is the real collision backstop.
 */
export function generateShareToken(length = 22): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
