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
});
