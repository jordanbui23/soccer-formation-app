export function firstNameFrom(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function lastInitialFrom(fullName: string): string | null {
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length > 1) return tokens[tokens.length - 1][0].toUpperCase();
  return null;
}

interface NameParts {
  name: string;
  firstName: string | null;
  lastName: string | null;
}

export function firstNameOf(rsvp: NameParts): string {
  if (rsvp.firstName && rsvp.firstName.trim()) return rsvp.firstName.trim();
  return firstNameFrom(rsvp.name);
}

export function fullNameOf(rsvp: NameParts): string {
  if (rsvp.firstName && rsvp.firstName.trim()) {
    const last = rsvp.lastName?.trim();
    return last ? `${rsvp.firstName.trim()} ${last}` : rsvp.firstName.trim();
  }
  return rsvp.name;
}

export function splitFullName(fullName: string): { firstName: string; lastName: string | null } {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: '', lastName: null };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: null };
  return { firstName: tokens[0], lastName: tokens.slice(1).join(' ') };
}

export function fieldLabels(fullNames: string[]): string[] {
  const firsts = fullNames.map(firstNameFrom);
  const counts = new Map<string, number>();
  for (const f of firsts) counts.set(f.toLowerCase(), (counts.get(f.toLowerCase()) ?? 0) + 1);

  return fullNames.map((fullName, i) => {
    const first = firsts[i];
    if ((counts.get(first.toLowerCase()) ?? 0) > 1) {
      const initial = lastInitialFrom(fullName);
      return initial ? `${first} ${initial}.` : first;
    }
    return first;
  });
}

export type { NameParts };
