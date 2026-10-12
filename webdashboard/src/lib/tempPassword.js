// A temporary password (dashboard plan §5.12): 14 characters a person can read aloud and type
// without mistakes: the machine-key alphabet (no 0/O, 1/I/L) plus lower case without l and o.
// crypto.getRandomValues with rejection sampling, so every character is equally likely. It's shown
// once in the dialog and never stored anywhere.
export const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';
export const TEMP_LENGTH = 14;

export function tempPassword(length = TEMP_LENGTH) {
  const out = [];
  const limit = 256 - (256 % TEMP_ALPHABET.length);   // bytes ≥ limit would bias the result
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(TEMP_ALPHABET[b % TEMP_ALPHABET.length]);
    }
  }
  return out.join('');
}
