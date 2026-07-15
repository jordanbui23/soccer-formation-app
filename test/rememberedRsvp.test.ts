import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetRsvp, getRememberedRsvp, rememberRsvp } from '../src/rememberedRsvp';

class TestStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingStorage extends TestStorage {
  setItem(): void {
    throw new Error('storage disabled');
  }

  getItem(): string | null {
    throw new Error('storage disabled');
  }
}

describe('rememberedRsvp', () => {
  const originalLocalStorage = globalThis.localStorage;

  function useStorage(storage: Storage): void {
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  }

  beforeEach(() => {
    useStorage(new TestStorage());
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: originalLocalStorage, configurable: true });
  });

  it('round-trips a remembered rsvp for a game', () => {
    rememberRsvp('game-1', 'rsvp-1', 'token-abc');
    expect(getRememberedRsvp('game-1')).toEqual({ rsvpId: 'rsvp-1', token: 'token-abc' });
  });

  it('returns null for a game with nothing remembered', () => {
    expect(getRememberedRsvp('game-unknown')).toBeNull();
  });

  it('keeps only one entry per game, replacing on re-reply', () => {
    rememberRsvp('game-1', 'rsvp-1', 'token-abc');
    rememberRsvp('game-1', 'rsvp-2', 'token-xyz');
    expect(getRememberedRsvp('game-1')).toEqual({ rsvpId: 'rsvp-2', token: 'token-xyz' });
  });

  it('remembers separate entries for different games', () => {
    rememberRsvp('game-1', 'rsvp-1', 'token-abc');
    rememberRsvp('game-2', 'rsvp-2', 'token-xyz');
    expect(getRememberedRsvp('game-1')).toEqual({ rsvpId: 'rsvp-1', token: 'token-abc' });
    expect(getRememberedRsvp('game-2')).toEqual({ rsvpId: 'rsvp-2', token: 'token-xyz' });
  });

  it('forgets a single game without touching others', () => {
    rememberRsvp('game-1', 'rsvp-1', 'token-abc');
    rememberRsvp('game-2', 'rsvp-2', 'token-xyz');
    forgetRsvp('game-1');
    expect(getRememberedRsvp('game-1')).toBeNull();
    expect(getRememberedRsvp('game-2')).toEqual({ rsvpId: 'rsvp-2', token: 'token-xyz' });
  });

  it('ignores empty ids', () => {
    rememberRsvp('', 'rsvp-1', 'token-abc');
    expect(getRememberedRsvp('')).toBeNull();
  });

  it('treats malformed stored json as empty', () => {
    localStorage.setItem('matchday.editTokens.v1', 'not json');
    expect(getRememberedRsvp('game-1')).toBeNull();
  });

  it('rejects a stored entry missing its token', () => {
    localStorage.setItem('matchday.editTokens.v1', JSON.stringify({ 'game-1': { rsvpId: 'rsvp-1' } }));
    expect(getRememberedRsvp('game-1')).toBeNull();
  });

  it('degrades to no-op when storage throws', () => {
    useStorage(new ThrowingStorage());
    expect(() => rememberRsvp('game-1', 'rsvp-1', 'token-abc')).not.toThrow();
    expect(getRememberedRsvp('game-1')).toBeNull();
    expect(() => forgetRsvp('game-1')).not.toThrow();
  });
});
