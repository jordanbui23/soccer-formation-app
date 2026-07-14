import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEAM_COLOR,
  TEXT_ON_DARK,
  TEXT_ON_LIGHT,
  foregroundFor,
  isDarkColor,
  isValidHexColor,
  normalizeHexColor,
  relativeLuminance,
} from '../src/color';

describe('isValidHexColor', () => {
  it('accepts strict #RRGGBB in either case', () => {
    expect(isValidHexColor('#000000')).toBe(true);
    expect(isValidHexColor('#ffffff')).toBe(true);
    expect(isValidHexColor('#1A7A45')).toBe(true);
    expect(isValidHexColor('  #ef5a25  ')).toBe(true);
  });

  it('rejects shorthand, missing hash, wrong length, and non-hex', () => {
    expect(isValidHexColor('#fff')).toBe(false);
    expect(isValidHexColor('000000')).toBe(false);
    expect(isValidHexColor('#12345')).toBe(false);
    expect(isValidHexColor('#1234567')).toBe(false);
    expect(isValidHexColor('#gggggg')).toBe(false);
    expect(isValidHexColor('rgb(0,0,0)')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidHexColor(undefined)).toBe(false);
    expect(isValidHexColor(null)).toBe(false);
    expect(isValidHexColor(0x000000)).toBe(false);
    expect(isValidHexColor({})).toBe(false);
  });
});

describe('normalizeHexColor', () => {
  it('lowercases and trims a valid value', () => {
    expect(normalizeHexColor('#1A7A45')).toBe('#1a7a45');
    expect(normalizeHexColor('  #EF5A25 ')).toBe('#ef5a25');
  });

  it('falls back to black for invalid or missing values', () => {
    expect(normalizeHexColor('#fff')).toBe(DEFAULT_TEAM_COLOR);
    expect(normalizeHexColor('not-a-color')).toBe(DEFAULT_TEAM_COLOR);
    expect(normalizeHexColor('')).toBe(DEFAULT_TEAM_COLOR);
    expect(normalizeHexColor(undefined)).toBe(DEFAULT_TEAM_COLOR);
    expect(normalizeHexColor(null)).toBe(DEFAULT_TEAM_COLOR);
    expect(normalizeHexColor(12345 as unknown)).toBe(DEFAULT_TEAM_COLOR);
  });

  it('defaults to black', () => {
    expect(DEFAULT_TEAM_COLOR).toBe('#000000');
  });
});

describe('validation vs legacy fallback', () => {
  const badInputs = ['#fff', '000000', 'not-a-color', '', '#12345g'];

  it('rejects bad create/update input (isValidHexColor is false)', () => {
    for (const value of badInputs) {
      expect(isValidHexColor(value)).toBe(false);
    }
  });

  it('accepts whitespace and uppercase input, then normalizes it', () => {
    expect(isValidHexColor('  #1A7A45 ')).toBe(true);
    expect(normalizeHexColor('  #1A7A45 ')).toBe('#1a7a45');
  });

  it('still maps missing/legacy persisted values to black on read', () => {
    expect(isValidHexColor(undefined)).toBe(false);
    expect(normalizeHexColor(undefined)).toBe(DEFAULT_TEAM_COLOR);
    expect(normalizeHexColor('')).toBe(DEFAULT_TEAM_COLOR);
  });
});

describe('relativeLuminance', () => {
  it('ranges from 0 for black to 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('normalizes invalid input to black luminance', () => {
    expect(relativeLuminance('bogus')).toBeCloseTo(0, 5);
  });
});

describe('foregroundFor', () => {
  it('returns white text for dark kits', () => {
    expect(foregroundFor('#000000')).toBe(TEXT_ON_DARK);
    expect(foregroundFor('#1a7a45')).toBe(TEXT_ON_DARK);
    expect(foregroundFor('#b23a48')).toBe(TEXT_ON_DARK);
  });

  it('returns black text for light kits', () => {
    expect(foregroundFor('#ffffff')).toBe(TEXT_ON_LIGHT);
    expect(foregroundFor('#f3ede1')).toBe(TEXT_ON_LIGHT);
    expect(foregroundFor('#ffd400')).toBe(TEXT_ON_LIGHT);
  });

  it('normalizes before choosing so invalid input maps to black kit', () => {
    expect(foregroundFor('nonsense')).toBe(TEXT_ON_DARK);
  });
});

describe('isDarkColor', () => {
  it('is true exactly when the accessible foreground is white', () => {
    expect(isDarkColor('#000000')).toBe(true);
    expect(isDarkColor('#1a7a45')).toBe(true);
    expect(isDarkColor('#ffffff')).toBe(false);
    expect(isDarkColor('#ffd400')).toBe(false);
  });
});
