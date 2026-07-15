const STORE_KEY = 'matchday.editTokens.v1';

export interface RememberedRsvp {
  rsvpId: string;
  token: string;
}

type Store = Record<string, RememberedRsvp>;

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable (private mode, quota, disabled): degrade to link-only */
  }
}

function isValidEntry(value: unknown): value is RememberedRsvp {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as RememberedRsvp).rsvpId === 'string' &&
    typeof (value as RememberedRsvp).token === 'string' &&
    (value as RememberedRsvp).rsvpId.length > 0 &&
    (value as RememberedRsvp).token.length > 0
  );
}

export function rememberRsvp(gameId: string, rsvpId: string, token: string): void {
  if (!gameId) return;
  const store = loadStore();
  store[gameId] = { rsvpId, token };
  saveStore(store);
}

export function getRememberedRsvp(gameId: string): RememberedRsvp | null {
  if (!gameId) return null;
  const entry = loadStore()[gameId];
  return isValidEntry(entry) ? entry : null;
}

export function forgetRsvp(gameId: string): void {
  if (!gameId) return;
  const store = loadStore();
  if (!(gameId in store)) return;
  delete store[gameId];
  saveStore(store);
}
