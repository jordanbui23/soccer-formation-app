-- Match-day Board — additive migration: structured RSVP name + preferred position.
--
-- Adds first_name, last_name, preferred_position to public.rsvps. All three are
-- NULLABLE and existing rows are left UNTOUCHED (no backfill): a pre-migration
-- row keeps its single `name`, and the client falls back to `name` when
-- first_name is null and renders a dash for a null position.
--
-- The legacy `name` column stays authoritative and NOT NULL; new writes compose
-- it from first + last so the safe public_rsvps projection and any older read
-- path keep working. preferred_position is constrained to the known position
-- codes (mirrors ALL_POSITIONS in src/formations.ts) but tolerates NULL.
--
-- This migration is additive and non-destructive. Column adds use
-- `if not exists`; the three public RPCs change parameter lists, so their old
-- signatures are dropped and recreated. The NEW frontend build must deploy
-- together with this migration (the new signatures replace the old ones).

-- ---------------------------------------------------------------------------
-- Columns (nullable, existing rows untouched)
-- ---------------------------------------------------------------------------
alter table public.rsvps
  add column if not exists first_name text
    constraint rsvps_first_name_len check (first_name is null or char_length(first_name) between 1 and 40);

alter table public.rsvps
  add column if not exists last_name text
    constraint rsvps_last_name_len check (last_name is null or char_length(last_name) <= 40);

alter table public.rsvps
  add column if not exists preferred_position text
    constraint rsvps_preferred_position_valid check (
      preferred_position is null or preferred_position in (
        'GK', 'CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB',
        'CDM', 'CM', 'CAM', 'LM', 'RM',
        'LW', 'RW', 'CF', 'ST'
      )
    );

-- ---------------------------------------------------------------------------
-- Safe public projection: add the new fields, still never exposes edit_token_hash
-- ---------------------------------------------------------------------------
drop view if exists public.public_rsvps;
create view public.public_rsvps
  with (security_invoker = false) as
  select id, game_id, name, first_name, last_name, preferred_position, status, created_at
  from public.rsvps;

revoke all on public.public_rsvps from anon, authenticated;
grant select on public.public_rsvps to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replace the public RSVP RPCs with structured-name + position signatures.
-- Old signatures are dropped (parameter list changes create a new overload).
-- ---------------------------------------------------------------------------
drop function if exists public.create_rsvp(uuid, text, text);
drop function if exists public.get_rsvp_for_edit(uuid, text);
drop function if exists public.update_rsvp(uuid, text, text, text);

create or replace function public.create_rsvp(
  p_game_id uuid,
  p_first_name text,
  p_last_name text,
  p_preferred_position text,
  p_status text
)
returns table (rsvp_id uuid, edit_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text := btrim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g'));
  v_last text := btrim(regexp_replace(coalesce(p_last_name, ''), '\s+', ' ', 'g'));
  v_name text;
  v_token text;
  v_open boolean;
  v_id uuid;
begin
  if char_length(v_first) < 1 or char_length(v_first) > 40 then
    raise exception 'invalid_name' using message = 'First name must be between 1 and 40 characters.';
  end if;
  if char_length(v_last) > 40 then
    raise exception 'invalid_name' using message = 'Last name must be 40 characters or fewer.';
  end if;
  if p_status not in ('yes', 'maybe', 'no') then
    raise exception 'invalid_status' using message = 'Invalid availability option.';
  end if;
  if p_preferred_position is null or p_preferred_position not in (
    'GK', 'CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB',
    'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'
  ) then
    raise exception 'invalid_position' using message = 'Choose a valid position.';
  end if;

  v_name := case when char_length(v_last) > 0 then v_first || ' ' || v_last else v_first end;
  if char_length(v_name) > 40 then
    v_name := substr(v_name, 1, 40);
  end if;

  select g.is_open into v_open from public.games g where g.id = p_game_id;
  if v_open is null then
    raise exception 'not_found' using message = 'Game not found.';
  end if;
  if not v_open then
    raise exception 'game_closed' using message = 'RSVPs are closed for this game.';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.rsvps (game_id, name, first_name, last_name, preferred_position, status, edit_token_hash)
  values (
    p_game_id,
    v_name,
    v_first,
    nullif(v_last, ''),
    p_preferred_position,
    p_status,
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  returning id into v_id;

  rsvp_id := v_id;
  edit_token := v_token;
  return next;
end;
$$;

create or replace function public.get_rsvp_for_edit(p_rsvp_id uuid, p_token text)
returns table (id uuid, name text, first_name text, last_name text, preferred_position text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
begin
  return query
    select r.id, r.name, r.first_name, r.last_name, r.preferred_position, r.status
    from public.rsvps r
    where r.id = p_rsvp_id and r.edit_token_hash = v_hash;
end;
$$;

create or replace function public.update_rsvp(
  p_rsvp_id uuid,
  p_token text,
  p_first_name text,
  p_last_name text,
  p_preferred_position text,
  p_status text
)
returns table (id uuid, name text, first_name text, last_name text, preferred_position text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text := btrim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g'));
  v_last text := btrim(regexp_replace(coalesce(p_last_name, ''), '\s+', ' ', 'g'));
  v_name text;
  v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_game uuid;
  v_open boolean;
begin
  if char_length(v_first) < 1 or char_length(v_first) > 40 then
    raise exception 'invalid_name' using message = 'First name must be between 1 and 40 characters.';
  end if;
  if char_length(v_last) > 40 then
    raise exception 'invalid_name' using message = 'Last name must be 40 characters or fewer.';
  end if;
  if p_status not in ('yes', 'maybe', 'no') then
    raise exception 'invalid_status' using message = 'Invalid availability option.';
  end if;
  if p_preferred_position is null or p_preferred_position not in (
    'GK', 'CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB',
    'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'
  ) then
    raise exception 'invalid_position' using message = 'Choose a valid position.';
  end if;

  v_name := case when char_length(v_last) > 0 then v_first || ' ' || v_last else v_first end;
  if char_length(v_name) > 40 then
    v_name := substr(v_name, 1, 40);
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
    set name = v_name,
        first_name = v_first,
        last_name = nullif(v_last, ''),
        preferred_position = p_preferred_position,
        status = p_status
    where rsvps.id = p_rsvp_id and rsvps.edit_token_hash = v_hash;

  return query
    select r.id, r.name, r.first_name, r.last_name, r.preferred_position, r.status
    from public.rsvps r where r.id = p_rsvp_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: least privilege for the new signatures
-- ---------------------------------------------------------------------------
revoke all on function public.create_rsvp(uuid, text, text, text, text) from public;
revoke all on function public.get_rsvp_for_edit(uuid, text) from public;
revoke all on function public.update_rsvp(uuid, text, text, text, text, text) from public;

grant execute on function public.create_rsvp(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.get_rsvp_for_edit(uuid, text) to anon, authenticated;
grant execute on function public.update_rsvp(uuid, text, text, text, text, text) to anon, authenticated;
