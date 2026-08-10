create type public.app_session_creation_outcome as enum (
  'created',
  'profile_unknown',
  'profile_inactive'
);

create type public.app_session_resolution_outcome as enum (
  'active',
  'unknown',
  'expired',
  'revoked',
  'profile_inactive'
);

create type public.app_session_revocation_outcome as enum (
  'revoked',
  'unknown',
  'already_revoked',
  'expired'
);

alter table public.profiles
  add constraint profiles_id_portal_installation_key unique (id, portal_installation_id);

create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  portal_installation_id smallint not null,
  profile_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '30 days'),
  revoked_at timestamptz,
  constraint app_sessions_portal_installation_fk foreign key (portal_installation_id)
    references public.portal_installations (singleton_key)
    on update restrict
    on delete restrict,
  constraint app_sessions_profile_portal_fk foreign key (profile_id, portal_installation_id)
    references public.profiles (id, portal_installation_id)
    on update restrict
    on delete restrict,
  constraint app_sessions_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint app_sessions_exact_expiry_check check (expires_at = created_at + interval '30 days'),
  constraint app_sessions_revoked_at_check check (
    revoked_at is null or (revoked_at >= created_at and revoked_at < expires_at)
  )
);

alter table public.app_sessions enable row level security;

revoke all on table public.app_sessions from public, anon, authenticated, service_role;
grant select, insert, update on table public.app_sessions to service_role;

create function public.create_app_session(
  p_portal_installation_id smallint,
  p_profile_id uuid,
  p_token_hash text
)
returns table (
  outcome public.app_session_creation_outcome,
  session_id uuid,
  profile_id uuid,
  portal_installation_id smallint,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_session public.app_sessions%rowtype;
  v_created_at timestamptz;
begin
  if p_portal_installation_id is null or p_profile_id is null then
    raise exception using errcode = '22023', message = 'invalid app session identity';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid app session token hash';
  end if;

  select profile.*
  into v_profile
  from public.profiles as profile
  where profile.id = p_profile_id
    and profile.portal_installation_id = p_portal_installation_id
  for update;

  if not found then
    return query select
      'profile_unknown'::public.app_session_creation_outcome,
      null::uuid, null::uuid, null::smallint, null::timestamptz, null::timestamptz;
    return;
  end if;

  if not v_profile.is_active
    or not v_profile.bitrix_active
    or v_profile.bitrix_user_type <> 'employee'
  then
    return query select
      'profile_inactive'::public.app_session_creation_outcome,
      null::uuid, null::uuid, null::smallint, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_created_at := clock_timestamp();
  insert into public.app_sessions (
    portal_installation_id,
    profile_id,
    token_hash,
    created_at,
    expires_at
  )
  values (
    p_portal_installation_id,
    p_profile_id,
    p_token_hash,
    v_created_at,
    v_created_at + interval '30 days'
  )
  returning * into v_session;

  return query select
    'created'::public.app_session_creation_outcome,
    v_session.id,
    v_session.profile_id,
    v_session.portal_installation_id,
    v_session.created_at,
    v_session.expires_at;
end;
$$;

create function public.resolve_app_session(p_token_hash text)
returns table (
  outcome public.app_session_resolution_outcome,
  session_id uuid,
  profile_id uuid,
  portal_installation_id smallint,
  role text,
  expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.app_sessions%rowtype;
  v_profile public.profiles%rowtype;
  v_now timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid app session token hash';
  end if;

  select session.*
  into v_session
  from public.app_sessions as session
  where session.token_hash = p_token_hash;

  if not found then
    return query select
      'unknown'::public.app_session_resolution_outcome,
      null::uuid, null::uuid, null::smallint, null::text, null::timestamptz;
    return;
  end if;

  if v_session.revoked_at is not null then
    return query select
      'revoked'::public.app_session_resolution_outcome,
      null::uuid, null::uuid, null::smallint, null::text, null::timestamptz;
    return;
  end if;

  v_now := clock_timestamp();
  if v_session.expires_at <= v_now then
    return query select
      'expired'::public.app_session_resolution_outcome,
      null::uuid, null::uuid, null::smallint, null::text, null::timestamptz;
    return;
  end if;

  select profile.*
  into v_profile
  from public.profiles as profile
  where profile.id = v_session.profile_id
    and profile.portal_installation_id = v_session.portal_installation_id;

  if not found
    or not v_profile.is_active
    or not v_profile.bitrix_active
    or v_profile.bitrix_user_type <> 'employee'
  then
    return query select
      'profile_inactive'::public.app_session_resolution_outcome,
      null::uuid, null::uuid, null::smallint, null::text, null::timestamptz;
    return;
  end if;

  return query select
    'active'::public.app_session_resolution_outcome,
    v_session.id,
    v_session.profile_id,
    v_session.portal_installation_id,
    v_profile.role,
    v_session.expires_at;
end;
$$;

create function public.revoke_app_session(p_token_hash text)
returns table (outcome public.app_session_revocation_outcome)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.app_sessions%rowtype;
  v_revoked_at timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid app session token hash';
  end if;

  select session.*
  into v_session
  from public.app_sessions as session
  where session.token_hash = p_token_hash
  for update;

  if not found then
    return query select 'unknown'::public.app_session_revocation_outcome;
    return;
  end if;

  if v_session.revoked_at is not null then
    return query select 'already_revoked'::public.app_session_revocation_outcome;
    return;
  end if;

  v_revoked_at := clock_timestamp();
  if v_session.expires_at <= v_revoked_at then
    return query select 'expired'::public.app_session_revocation_outcome;
    return;
  end if;

  update public.app_sessions as session
  set revoked_at = v_revoked_at
  where session.id = v_session.id;

  return query select 'revoked'::public.app_session_revocation_outcome;
end;
$$;

revoke all on function public.create_app_session(smallint, uuid, text)
  from public, anon, authenticated;
revoke all on function public.resolve_app_session(text)
  from public, anon, authenticated;
revoke all on function public.revoke_app_session(text)
  from public, anon, authenticated;

grant execute on function public.create_app_session(smallint, uuid, text) to service_role;
grant execute on function public.resolve_app_session(text) to service_role;
grant execute on function public.revoke_app_session(text) to service_role;
