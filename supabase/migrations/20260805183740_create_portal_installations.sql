create type public.portal_installation_reconciliation_outcome as enum (
  'created',
  'unchanged',
  'origin_updated',
  'mismatch'
);

create table public.portal_installations (
  singleton_key smallint primary key default 1,
  member_id text not null unique,
  portal_origin text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint portal_installations_singleton_key_check check (singleton_key = 1),
  constraint portal_installations_member_id_check check (member_id ~ '^[A-Fa-f0-9]{32}$'),
  constraint portal_installations_portal_origin_check check (
    char_length(portal_origin) between 10 and 255
    and portal_origin ~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
    and portal_origin !~ '\.\.'
  ),
  constraint portal_installations_timestamps_check check (updated_at >= created_at)
);

alter table public.portal_installations enable row level security;

revoke all on table public.portal_installations from public, anon, authenticated;
grant select, insert, update on table public.portal_installations to service_role;

create function public.reconcile_portal_installation(
  p_member_id text,
  p_portal_origin text
)
returns table (
  outcome public.portal_installation_reconciliation_outcome,
  member_id text,
  portal_origin text,
  previous_portal_origin text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_installation public.portal_installations%rowtype;
  v_previous_portal_origin text;
begin
  if p_member_id is null or p_member_id !~ '^[A-Fa-f0-9]{32}$' then
    raise exception using errcode = '22023', message = 'invalid portal member id';
  end if;

  if p_portal_origin is null
    or char_length(p_portal_origin) not between 10 and 255
    or p_portal_origin !~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
    or p_portal_origin ~ '\.\.'
  then
    raise exception using errcode = '22023', message = 'invalid canonical portal origin';
  end if;

  insert into public.portal_installations (singleton_key, member_id, portal_origin)
  values (1, p_member_id, p_portal_origin)
  on conflict (singleton_key) do nothing
  returning * into v_installation;

  if found then
    return query
    select
      'created'::public.portal_installation_reconciliation_outcome,
      v_installation.member_id,
      v_installation.portal_origin,
      null::text,
      v_installation.created_at,
      v_installation.updated_at;
    return;
  end if;

  select installation.*
  into strict v_installation
  from public.portal_installations as installation
  where installation.singleton_key = 1
  for update;

  if v_installation.member_id <> p_member_id then
    return query
    select
      'mismatch'::public.portal_installation_reconciliation_outcome,
      v_installation.member_id,
      v_installation.portal_origin,
      null::text,
      v_installation.created_at,
      v_installation.updated_at;
    return;
  end if;

  if v_installation.portal_origin = p_portal_origin then
    return query
    select
      'unchanged'::public.portal_installation_reconciliation_outcome,
      v_installation.member_id,
      v_installation.portal_origin,
      null::text,
      v_installation.created_at,
      v_installation.updated_at;
    return;
  end if;

  v_previous_portal_origin := v_installation.portal_origin;

  update public.portal_installations as installation
  set
    portal_origin = p_portal_origin,
    updated_at = clock_timestamp()
  where installation.singleton_key = 1
  returning installation.* into v_installation;

  return query
  select
    'origin_updated'::public.portal_installation_reconciliation_outcome,
    v_installation.member_id,
    v_installation.portal_origin,
    v_previous_portal_origin,
    v_installation.created_at,
    v_installation.updated_at;
end;
$$;

revoke all on function public.reconcile_portal_installation(text, text) from public, anon, authenticated;
grant execute on function public.reconcile_portal_installation(text, text) to service_role;
