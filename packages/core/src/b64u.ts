/**
 * base64url, by hand.
 *
 * WebAuthn speaks ArrayBuffers and the API speaks JSON, so every credential
 * crosses this seam twice. atob/btoa would do it in a browser, but core is
 * also imported by the node test run and by native, and a codec that works in
 * two of the three places is the kind of thing that fails once, in the place
 * nobody is looking at.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function bytesToB64u(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += ALPHABET[n & 63]!;
  }
  return out;
}

export function b64uToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  // A base64 group is 2, 3 or 4 characters; one left over cannot have come
  // from any input. Decoding it anyway drops that character's bits in
  // silence, so a truncated credential id came back SHORTER instead of
  // wrong, and the failure surfaced later as a signature that would not
  // verify — true, and no help at all in finding out why.
  if (clean.length % 4 === 1) throw new Error('base64url: truncated');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('base64url: bad character');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}
