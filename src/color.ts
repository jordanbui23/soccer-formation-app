export const DEFAULT_TEAM_COLOR = '#000000';
export const TEXT_ON_LIGHT = '#000000';
export const TEXT_ON_DARK = '#ffffff';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_PATTERN.test(value.trim());
}

export function normalizeHexColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_TEAM_COLOR;
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return DEFAULT_TEAM_COLOR;
  return trimmed.toLowerCase();
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const norm = normalizeHexColor(hex);
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function foregroundFor(hex: string): string {
  const luminance = relativeLuminance(hex);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  return contrastWithBlack >= contrastWithWhite ? TEXT_ON_LIGHT : TEXT_ON_DARK;
}

export function isDarkColor(hex: string): boolean {
  return foregroundFor(hex) === TEXT_ON_DARK;
}
