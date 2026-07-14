import { describe, it, expect } from 'vitest';
import { generateEditToken, hashToken, newId, timingSafeEqual } from '../src/crypto';

describe('generateEditToken', () => {
  it('produces a 64-character hex string (32 bytes)', () => {
    const token = generateEditToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateEditToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('hashToken', () => {
  it('is deterministic for the same input', async () => {
    const token = 'abc123';
    expect(await hashToken(token)).toBe(await hashToken(token));
  });

  it('produces a SHA-256 hex digest and differs for different inputs', async () => {
    const a = await hashToken('one');
    const b = await hashToken('two');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('does not equal the plaintext token', async () => {
    const token = generateEditToken();
    expect(await hashToken(token)).not.toBe(token);
  });
});

describe('timingSafeEqual', () => {
  it('returns true for equal strings and false otherwise', () => {
    expect(timingSafeEqual('deadbeef', 'deadbeef')).toBe(true);
    expect(timingSafeEqual('deadbeef', 'deadbee0')).toBe(false);
    expect(timingSafeEqual('short', 'longer-string')).toBe(false);
  });
});

describe('newId', () => {
  it('returns a non-empty unique identifier', () => {
    expect(newId().length).toBeGreaterThan(0);
    expect(newId()).not.toBe(newId());
  });
});
