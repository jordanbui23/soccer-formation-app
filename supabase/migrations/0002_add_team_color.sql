-- Match-day Board — additive migration: per-game primary team color.
--
-- Adds a single team_color column to public.games. New rows default to home
-- black (#000000); existing rows are backfilled with the same default. A regex
-- check constrains the value to a strict #RRGGBB hex string, mirroring the
-- client-side validation in src/color.ts.
--
-- This migration is additive and non-destructive: it only adds a column and a
-- constraint, and is safe to run against a database already created by
-- 0001_init.sql. The column-level guard `add column if not exists` keeps it
-- idempotent, so re-running is a no-op.

alter table public.games
  add column if not exists team_color text not null default '#000000'
    constraint games_team_color_hex check (team_color ~ '^#[0-9a-fA-F]{6}$');
