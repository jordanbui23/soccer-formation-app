-- Match-day Board — schema, row level security, and secure RSVP RPCs.
--
-- Security model:
--   * games:   admins (authenticated) own their rows; anon may read (public game links).
--   * rsvps:   NO direct anon/public write access. Creation and token-based edits go
--              through SECURITY DEFINER RPCs only. edit_token_hash is never exposed;
--              the public reads a safe projection view (public_rsvps).
--   * lineups: admin-only, ownership scoped through the parent game.
--
-- The plaintext edit token is generated inside create_rsvp and returned exactly once.
-- Only its SHA-256 hash is ever persisted.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique,
  opponent text not null check (char_length(opponent) between 1 and 40),
  match_date date not null,
  match_time text,
  venue text check (venue is null or char_length(venue) <= 60),
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  status text not null check (status in ('yes', 'maybe', 'no')),
  edit_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lineups (
  game_id uuid primary key references public.games (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists rsvps_game_id_idx on public.rsvps (game_id);
create index if not exists games_owner_id_idx on public.games (owner_id);

-- ---------------------------------------------------------------------------
-- Triggers: slug generation + updated_at bookkeeping
-- ---------------------------------------------------------------------------
create or replace function public.set_game_slug()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug :=
      trim(both '-' from lower(regexp_replace(coalesce(new.opponent, 'game'), '[^a-zA-Z0-9]+', '-', 'g')))
      || '-' || to_char(new.match_date, 'YYYY-MM-DD')
      || '-' || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6);
  end if;
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists games_set_slug on public.games;
create trigger games_set_slug
  before insert on public.games
  for each row execute function public.set_game_slug();

drop trigger if exists rsvps_touch on public.rsvps;
create trigger rsvps_touch
  before update on public.rsvps
  for each row execute function public.touch_updated_at();

drop trigger if exists lineups_touch on public.lineups;
create trigger lineups_touch
  before update on public.lineups
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.games enable row level security;
alter table public.rsvps enable row level security;
alter table public.lineups enable row level security;

drop policy if exists games_anon_read on public.games;
create policy games_anon_read on public.games
  for select to anon using (true);

drop policy if exists games_owner_read on public.games;
create policy games_owner_read on public.games
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists games_owner_insert on public.games;
create policy games_owner_insert on public.games
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists games_owner_update on public.games;
create policy games_owner_update on public.games
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists games_owner_delete on public.games;
create policy games_owner_delete on public.games
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists rsvps_owner_read on public.rsvps;
create policy rsvps_owner_read on public.rsvps
  for select to authenticated
  using (exists (select 1 from public.games g where g.id = rsvps.game_id and g.owner_id = auth.uid()));

drop policy if exists rsvps_owner_update on public.rsvps;
create policy rsvps_owner_update on public.rsvps
  for update to authenticated
  using (exists (select 1 from public.games g where g.id = rsvps.game_id and g.owner_id = auth.uid()))
  with check (exists (select 1 from public.games g where g.id = rsvps.game_id and g.owner_id = auth.uid()));

drop policy if exists rsvps_owner_delete on public.rsvps;
create policy rsvps_owner_delete on public.rsvps
  for delete to authenticated
  using (exists (select 1 from public.games g where g.id = rsvps.game_id and g.owner_id = auth.uid()));

drop policy if exists lineups_owner_all on public.lineups;
create policy lineups_owner_all on public.lineups
  for all to authenticated
  using (exists (select 1 from public.games g where g.id = lineups.game_id and g.owner_id = auth.uid()))
  with check (exists (select 1 from public.games g where g.id = lineups.game_id and g.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Safe public projection: never exposes edit_token_hash
-- ---------------------------------------------------------------------------
drop view if exists public.public_rsvps;
create view public.public_rsvps
  with (security_invoker = false) as
  select id, game_id, name, status, created_at
  from public.rsvps;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER RPCs for public RSVP create / read / update by token
-- ---------------------------------------------------------------------------
create or replace function public.create_rsvp(p_game_id uuid, p_name text, p_status text)
returns table (rsvp_id uuid, edit_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_token text;
  v_open boolean;
  v_id uuid;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'invalid_name' using message = 'Name must be between 1 and 40 characters.';
  end if;
  if p_status not in ('yes', 'maybe', 'no') then
    raise exception 'invalid_status' using message = 'Invalid availability option.';
  end if;

  select g.is_open into v_open from public.games g where g.id = p_game_id;
  if v_open is null then
    raise exception 'not_found' using message = 'Game not found.';
  end if;
  if not v_open then
    raise exception 'game_closed' using message = 'RSVPs are closed for this game.';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.rsvps (game_id, name, status, edit_token_hash)
  values (p_game_id, v_name, p_status, encode(extensions.digest(v_token, 'sha256'), 'hex'))
  returning id into v_id;

  rsvp_id := v_id;
  edit_token := v_token;
  return next;
end;
$$;

create or replace function public.get_rsvp_for_edit(p_rsvp_id uuid, p_token text)
returns table (id uuid, name text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
begin
  return query
    select r.id, r.name, r.status
    from public.rsvps r
    where r.id = p_rsvp_id and r.edit_token_hash = v_hash;
end;
$$;

create or replace function public.update_rsvp(p_rsvp_id uuid, p_token text, p_name text, p_status text)
returns table (id uuid, name text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_game uuid;
  v_open boolean;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'invalid_name' using message = 'Name must be between 1 and 40 characters.';
  end if;
  if p_status not in ('yes', 'maybe', 'no') then
    raise exception 'invalid_status' using message = 'Invalid availability option.';
  end if;

  select r.game_id into v_game
  from public.rsvps r
  where r.id = p_rsvp_id and r.edit_token_hash = v_hash;

  if v_game is null then
    raise exception 'invalid_token' using message = 'This edit link is not valid.';
  end if;

  select g.is_open into v_open from public.games g where g.id = v_game;
  if not v_open then
    raise exception 'game_closed' using message = 'RSVPs are closed for this game.';
  end if;

  update public.rsvps
    set name = v_name, status = p_status
    where rsvps.id = p_rsvp_id and rsvps.edit_token_hash = v_hash;

  return query
    select r.id, r.name, r.status from public.rsvps r where r.id = p_rsvp_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: least privilege
-- ---------------------------------------------------------------------------
revoke all on table public.games from anon, authenticated;
grant select on table public.games to anon;
grant select, insert, update, delete on table public.games to authenticated;

revoke all on table public.rsvps from anon, authenticated;
grant select, update, delete on table public.rsvps to authenticated;

revoke all on table public.lineups from anon, authenticated;
grant select, insert, update, delete on table public.lineups to authenticated;

revoke all on public.public_rsvps from anon, authenticated;
grant select on public.public_rsvps to anon, authenticated;

revoke all on function public.create_rsvp(uuid, text, text) from public;
revoke all on function public.get_rsvp_for_edit(uuid, text) from public;
revoke all on function public.update_rsvp(uuid, text, text, text) from public;

grant execute on function public.create_rsvp(uuid, text, text) to anon, authenticated;
grant execute on function public.get_rsvp_for_edit(uuid, text) to anon, authenticated;
grant execute on function public.update_rsvp(uuid, text, text, text) to anon, authenticated;

-- To provision an admin: create the user in Supabase Auth (Dashboard or CLI).
-- Any authenticated user may create and own games; ownership is enforced by RLS.
