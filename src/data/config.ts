export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  hasSupabase: boolean;
}

export function readConfig(): AppConfig {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  return {
    supabaseUrl,
    supabaseAnonKey,
    hasSupabase: supabaseUrl.length > 0 && supabaseAnonKey.length > 0,
  };
}

export function slugify(opponent: string, matchDate: string): string {
  const base = `${opponent}-${matchDate}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : `game-${suffix}`;
}
