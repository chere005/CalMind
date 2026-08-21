import { describe, it, expect } from 'vitest';
import { b64uToBytes, bytesToB64u } from '../src/b64u';

describe('base64url', () => {
  it('round trips every byte length, which is where padding goes wrong', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = new Uint8Array(n).map((_x, i) => (i * 37 + n) & 0xff);
      expect(b64uToBytes(bytesToB64u(bytes))).toEqual(bytes);
    }
  });
  it('uses the url alphabet and no padding', () => {
    const b = bytesToB64u(new Uint8Array([251, 255, 190]));
    expect(b).toBe('-_--');
    expect(b).not.toContain('=');
    expect(b).not.toContain('+');
    expect(b).not.toContain('/');
  });
  it('accepts padding it never writes, since servers vary', () => {
    expect(b64uToBytes('AAAA')).toEqual(new Uint8Array([0, 0, 0]));
    expect(b64uToBytes('AA==')).toEqual(new Uint8Array([0]));
  });
  it('refuses a character that is not in the alphabet', () => {
    expect(() => b64uToBytes('ab*d')).toThrow();
  });
  it('refuses a length no encoder could have produced', () => {
    // Four characters carry three bytes, and a trailing group is 2 or 3
    // characters. One left over is impossible. It used to decode anyway,
    // dropping that character's bits without a word, so a truncated
    // credential came back SHORTER rather than rejected and the trouble
    // surfaced as a signature that would not verify.
    expect(() => b64uToBytes('A')).toThrow(/truncated/);
    expect(() => b64uToBytes('AAAAA')).toThrow(/truncated/);
    expect(() => b64uToBytes('AAAAAAAAA')).toThrow(/truncated/);
    // The lengths that ARE possible still work, padded or not.
    expect(b64uToBytes('').length).toBe(0);
    expect(b64uToBytes('AA').length).toBe(1);
    expect(b64uToBytes('AAA').length).toBe(2);
    expect(b64uToBytes('AAAA').length).toBe(3);
    expect(b64uToBytes('AA==').length).toBe(1);
  });
});
