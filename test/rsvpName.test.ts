import { describe, expect, it } from 'vitest';
import { fieldLabels, firstNameFrom, firstNameOf, fullNameOf, splitFullName } from '../src/rsvpName';

describe('firstNameFrom', () => {
  it('returns the first whitespace-delimited token', () => {
    expect(firstNameFrom('Alex Morgan')).toBe('Alex');
    expect(firstNameFrom('  Sam  Kerr ')).toBe('Sam');
    expect(firstNameFrom('Cher')).toBe('Cher');
  });
});

describe('firstNameOf', () => {
  it('prefers the structured firstName when present', () => {
    expect(firstNameOf({ name: 'Alex Morgan', firstName: 'Alex', lastName: 'Morgan' })).toBe('Alex');
  });

  it('falls back to the first token of name for legacy rows', () => {
    expect(firstNameOf({ name: 'Jordan Pike', firstName: null, lastName: null })).toBe('Jordan');
    expect(firstNameOf({ name: 'Solo', firstName: null, lastName: null })).toBe('Solo');
  });
});

describe('fullNameOf', () => {
  it('composes first and last when structured', () => {
    expect(fullNameOf({ name: 'ignored', firstName: 'Alex', lastName: 'Morgan' })).toBe('Alex Morgan');
  });

  it('uses first name alone when last name is absent', () => {
    expect(fullNameOf({ name: 'ignored', firstName: 'Alex', lastName: null })).toBe('Alex');
    expect(fullNameOf({ name: 'ignored', firstName: 'Alex', lastName: '' })).toBe('Alex');
  });

  it('falls back to name for legacy rows', () => {
    expect(fullNameOf({ name: 'Jordan Pike', firstName: null, lastName: null })).toBe('Jordan Pike');
  });
});

describe('splitFullName', () => {
  it('splits first and last on the first space', () => {
    expect(splitFullName('Alex Morgan')).toEqual({ firstName: 'Alex', lastName: 'Morgan' });
  });

  it('keeps multi-token last names together', () => {
    expect(splitFullName('Sam Van Der Berg')).toEqual({ firstName: 'Sam', lastName: 'Van Der Berg' });
  });

  it('returns a null last name for a single token', () => {
    expect(splitFullName('Cher')).toEqual({ firstName: 'Cher', lastName: null });
  });

  it('handles surrounding whitespace', () => {
    expect(splitFullName('  Jordan   Pike  ')).toEqual({ firstName: 'Jordan', lastName: 'Pike' });
  });

  it('returns empty first name for an empty string', () => {
    expect(splitFullName('   ')).toEqual({ firstName: '', lastName: null });
  });
});

describe('fieldLabels', () => {
  it('shows first name only when first names are unique', () => {
    expect(fieldLabels(['Alex Morgan', 'Jordan Pike', 'Solo'])).toEqual(['Alex', 'Jordan', 'Solo']);
  });

  it('disambiguates duplicate first names with a last initial', () => {
    expect(fieldLabels(['Sam Kerr', 'Sam Doe'])).toEqual(['Sam K.', 'Sam D.']);
  });

  it('is case-insensitive when detecting collisions', () => {
    expect(fieldLabels(['sam kerr', 'Sam Doe'])).toEqual(['sam K.', 'Sam D.']);
  });

  it('keeps a bare first name on collision when there is no last name to initial', () => {
    expect(fieldLabels(['Sam', 'Sam Doe'])).toEqual(['Sam', 'Sam D.']);
  });
});
