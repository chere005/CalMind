/**
 * The credential codec, round-tripped both ways.
 *
 * Every WebAuthn credential crosses this seam twice, and the failure mode it
 * already carries a guard for is the instructive one: a truncated string used
 * to decode SHORTER rather than fail, so the damage surfaced much later as a
 * signature that would not verify — true, and no help at all in finding out
 * why. That is the shape worth fuzzing for, not the happy path.
 */
import { describe, it, expect } from 'vitest';
import { bytesToB64u, b64uToBytes } from '../src/b64u';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

describe('base64url round trip', () => {
  it('every byte string comes back exactly, at every length', () => {
    let seed = 99;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let t = 0; t < 3000; t++) {
      // Lengths 0..64 so all three tail cases (0, 1, 2 bytes over) are hit
      // many times over, and long enough that the accumulator has shifted well
      // past 32 bits — which is exactly where a hand-rolled codec goes wrong.
      const n = rnd(65);
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = rnd(256);
      const s = bytesToB64u(bytes);
      expect(/^[A-Za-z0-9_-]*$/.test(s), `url-safe alphabet only: ${s}`).toBe(true);
      expect(s.includes('='), 'no padding is emitted').toBe(false);
      expect(Array.from(b64uToBytes(s)), `round trip at length ${n}`).toEqual(Array.from(bytes));
    }
  });

  it('the encoding is canonical, so a string survives a decode and re-encode', () => {
    let seed = 31337;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let t = 0; t < 1500; t++) {
      const n = rnd(48);
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = rnd(256);
      const s = bytesToB64u(bytes);
      expect(bytesToB64u(b64uToBytes(s))).toBe(s);
    }
  });

  it('refuses what cannot have come from an encoder, rather than guessing', () => {
    // One character over a group boundary: no input produces this.
    expect(() => b64uToBytes('A')).toThrow(/truncated/);
    expect(() => b64uToBytes('AAAAA')).toThrow(/truncated/);
    // Characters outside the url-safe alphabet, including the two that make
    // this base64URL rather than base64.
    expect(() => b64uToBytes('AA+A')).toThrow(/bad character/);
    expect(() => b64uToBytes('AA/A')).toThrow(/bad character/);
    expect(() => b64uToBytes('AA A')).toThrow(/bad character/);
  });

  it('tolerates the padding a strict base64 encoder would have added', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const bytes = new Uint8Array(n).fill(7);
      const s = bytesToB64u(bytes);
      const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
      expect(Array.from(b64uToBytes(padded)), `padded length ${n}`).toEqual(Array.from(bytes));
    }
  });

  it('every alphabet character decodes to its own index', () => {
    // Catches a transposed alphabet, which round-trips perfectly against
    // itself and agrees with nobody else on earth.
    for (let v = 0; v < 64; v++) {
      const b = b64uToBytes(ALPHABET[v]! + 'A');
      expect(b[0], `${ALPHABET[v]} is value ${v}`).toBe((v << 2) & 0xff);
    }
  });
});
