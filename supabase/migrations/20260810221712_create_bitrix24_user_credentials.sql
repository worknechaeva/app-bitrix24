create type public.bitrix24_credential_creation_outcome as enum (
  'created',
  'profile_unknown',
  'profile_inactive',
  'already_exists'
);

create type public.bitrix24_credential_resolution_outcome as enum (
  'active',
  'unknown',
  'profile_inactive',
  'reauth_required',
  'disabled'
);

create type public.bitrix24_credential_rotation_outcome as enum (
  'rotated',
  'unknown',
  'profile_inactive',
  'reauth_required',
  'disabled',
  'version_conflict'
);

create type public.bitrix24_credential_reauth_outcome as enum (
  'marked',
  'already_reauth_required',
  'unknown',
  'profile_inactive',
  'disabled',
  'version_conflict'
);

create table public.bitrix24_user_credentials (
  id uuid primary key default gen_random_uuid(),
  portal_installation_id smallint not null,
  profile_id uuid not null,
  access_token_ciphertext text not null,
  access_token_iv text not null,
  access_token_auth_tag text not null,
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  refresh_token_auth_tag text not null,
  encryption_version smallint not null,
  token_version bigint not null,
  client_endpoint text not null,
  access_token_expires_at timestamptz,
  status text not null,
  reauth_required_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint bitrix24_user_credentials_profile_portal_key unique (profile_id, portal_installation_id),
  constraint bitrix24_user_credentials_portal_installation_fk foreign key (portal_installation_id)
    references public.portal_installations (singleton_key)
    on update restrict
    on delete restrict,
  constraint bitrix24_user_credentials_profile_portal_fk foreign key (profile_id, portal_installation_id)
    references public.profiles (id, portal_installation_id)
    on update restrict
    on delete restrict,
  constraint bitrix24_user_credentials_access_ciphertext_check check (
    char_length(access_token_ciphertext) between 2 and 32768
    and access_token_ciphertext ~ '^[A-Za-z0-9_-]+$'
    and char_length(access_token_ciphertext) % 4 <> 1
  ),
  constraint bitrix24_user_credentials_refresh_ciphertext_check check (
    char_length(refresh_token_ciphertext) between 2 and 32768
    and refresh_token_ciphertext ~ '^[A-Za-z0-9_-]+$'
    and char_length(refresh_token_ciphertext) % 4 <> 1
  ),
  constraint bitrix24_user_credentials_access_iv_check check (
    char_length(access_token_iv) = 16 and access_token_iv ~ '^[A-Za-z0-9_-]{16}$'
  ),
  constraint bitrix24_user_credentials_refresh_iv_check check (
    char_length(refresh_token_iv) = 16 and refresh_token_iv ~ '^[A-Za-z0-9_-]{16}$'
  ),
  constraint bitrix24_user_credentials_access_auth_tag_check check (
    char_length(access_token_auth_tag) = 22 and access_token_auth_tag ~ '^[A-Za-z0-9_-]{22}$'
  ),
  constraint bitrix24_user_credentials_refresh_auth_tag_check check (
    char_length(refresh_token_auth_tag) = 22 and refresh_token_auth_tag ~ '^[A-Za-z0-9_-]{22}$'
  ),
  constraint bitrix24_user_credentials_distinct_iv_check check (access_token_iv <> refresh_token_iv),
  constraint bitrix24_user_credentials_encryption_version_check check (encryption_version = 1),
  constraint bitrix24_user_credentials_token_version_check check (token_version > 0),
  constraint bitrix24_user_credentials_client_endpoint_check check (
    char_length(client_endpoint) between 16 and 2048
    and client_endpoint ~ '^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?/rest/$'
  ),
  constraint bitrix24_user_credentials_status_check check (
    status in ('active', 'reauth_required', 'disabled')
  ),
  constraint bitrix24_user_credentials_reauth_timestamp_check check (
    (status = 'reauth_required' and reauth_required_at is not null)
    or (status <> 'reauth_required' and reauth_required_at is null)
  ),
  constraint bitrix24_user_credentials_timestamps_check check (
    updated_at >= created_at
    and (reauth_required_at is null or reauth_required_at >= created_at)
  )
);

create index bitrix24_user_credentials_portal_installation_idx
  on public.bitrix24_user_credentials (portal_installation_id);

alter table public.bitrix24_user_credentials enable row level security;

revoke all on table public.bitrix24_user_credentials from public, anon, authenticated, service_role;
grant select, insert, update on table public.bitrix24_user_credentials to service_role;

create function public.create_bitrix24_user_credentials(
  p_portal_installation_id smallint,
  p_profile_id uuid,
  p_access_token_ciphertext text,
  p_access_token_iv text,
  p_access_token_auth_tag text,
  p_refresh_token_ciphertext text,
  p_refresh_token_iv text,
  p_refresh_token_auth_tag text,
  p_encryption_version smallint,
  p_client_endpoint text,
  p_access_token_expires_at timestamptz
)
returns table (
  outcome public.bitrix24_credential_creation_outcome,
  credential_id uuid,
  portal_installation_id smallint,
  profile_id uuid,
  access_token_ciphertext text,
  access_token_iv text,
  access_token_auth_tag text,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  refresh_token_auth_tag text,
  encryption_version smallint,
  token_version bigint,
  client_endpoint text,
  access_token_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_credential public.bitrix24_user_credentials%rowtype;
  v_now timestamptz;
begin
  if p_portal_installation_id is null or p_profile_id is null then
    raise exception using errcode = '22023', message = 'invalid credential identity';
  end if;

  select profile.* into v_profile
  from public.profiles as profile
  where profile.id = p_profile_id
    and profile.portal_installation_id = p_portal_installation_id
  for update;

  if not found then
    return query select 'profile_unknown'::public.bitrix24_credential_creation_outcome,
      null::uuid, null::smallint, null::uuid,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::smallint, null::bigint, null::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  if not v_profile.is_active or not v_profile.bitrix_active or v_profile.bitrix_user_type <> 'employee' then
    return query select 'profile_inactive'::public.bitrix24_credential_creation_outcome,
      null::uuid, null::smallint, null::uuid,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::smallint, null::bigint, null::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.bitrix24_user_credentials as credential
    where credential.profile_id = p_profile_id
      and credential.portal_installation_id = p_portal_installation_id
  ) then
    return query select 'already_exists'::public.bitrix24_credential_creation_outcome,
      null::uuid, null::smallint, null::uuid,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::smallint, null::bigint, null::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_now := clock_timestamp();
  insert into public.bitrix24_user_credentials (
    portal_installation_id, profile_id,
    access_token_ciphertext, access_token_iv, access_token_auth_tag,
    refresh_token_ciphertext, refresh_token_iv, refresh_token_auth_tag,
    encryption_version, token_version, client_endpoint, access_token_expires_at,
    status, created_at, updated_at
  ) values (
    p_portal_installation_id, p_profile_id,
    p_access_token_ciphertext, p_access_token_iv, p_access_token_auth_tag,
    p_refresh_token_ciphertext, p_refresh_token_iv, p_refresh_token_auth_tag,
    p_encryption_version, 1, p_client_endpoint, p_access_token_expires_at,
    'active', v_now, v_now
  )
  returning * into v_credential;

  return query select 'created'::public.bitrix24_credential_creation_outcome,
    v_credential.id, v_credential.portal_installation_id, v_credential.profile_id,
    v_credential.access_token_ciphertext, v_credential.access_token_iv, v_credential.access_token_auth_tag,
    v_credential.refresh_token_ciphertext, v_credential.refresh_token_iv, v_credential.refresh_token_auth_tag,
    v_credential.encryption_version, v_credential.token_version, v_credential.client_endpoint,
    v_credential.access_token_expires_at, v_credential.created_at, v_credential.updated_at;
end;
$$;

create function public.resolve_bitrix24_user_credentials(
  p_portal_installation_id smallint,
  p_profile_id uuid
)
returns table (
  outcome public.bitrix24_credential_resolution_outcome,
  credential_id uuid,
  portal_installation_id smallint,
  profile_id uuid,
  access_token_ciphertext text,
  access_token_iv text,
  access_token_auth_tag text,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  refresh_token_auth_tag text,
  encryption_version smallint,
  token_version bigint,
  client_endpoint text,
  access_token_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_credential public.bitrix24_user_credentials%rowtype;
begin
  if p_portal_installation_id is null or p_profile_id is null then
    raise exception using errcode = '22023', message = 'invalid credential identity';
  end if;

  select credential.* into v_credential
  from public.bitrix24_user_credentials as credential
  where credential.profile_id = p_profile_id
    and credential.portal_installation_id = p_portal_installation_id;

  if not found then
    return query select 'unknown'::public.bitrix24_credential_resolution_outcome,
      null::uuid, null::smallint, null::uuid,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::smallint, null::bigint, null::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  select profile.* into v_profile
  from public.profiles as profile
  where profile.id = p_profile_id
    and profile.portal_installation_id = p_portal_installation_id;

  if not found or not v_profile.is_active or not v_profile.bitrix_active
    or v_profile.bitrix_user_type <> 'employee'
  then
    return query select 'profile_inactive'::public.bitrix24_credential_resolution_outcome,
      null::uuid, null::smallint, null::uuid,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::smallint, null::bigint, null::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_credential.status = 'reauth_required' then
    return query select 'reauth_required'::public.bitrix24_credential_resolution_outcome,
      null::uuid, null::smallint, null::uuid,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::smallint, null::bigint, null::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_credential.status = 'disabled' then
    return query select 'disabled'::public.bitrix24_credential_resolution_outcome,
      null::uuid, null::smallint, null::uuid,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::smallint, null::bigint, null::text, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  return query select 'active'::public.bitrix24_credential_resolution_outcome,
    v_credential.id, v_credential.portal_installation_id, v_credential.profile_id,
    v_credential.access_token_ciphertext, v_credential.access_token_iv, v_credential.access_token_auth_tag,
    v_credential.refresh_token_ciphertext, v_credential.refresh_token_iv, v_credential.refresh_token_auth_tag,
    v_credential.encryption_version, v_credential.token_version, v_credential.client_endpoint,
    v_credential.access_token_expires_at, v_credential.created_at, v_credential.updated_at;
end;
$$;

create function public.rotate_bitrix24_user_credentials(
  p_portal_installation_id smallint,
  p_profile_id uuid,
  p_expected_token_version bigint,
  p_access_token_ciphertext text,
  p_access_token_iv text,
  p_access_token_auth_tag text,
  p_refresh_token_ciphertext text,
  p_refresh_token_iv text,
  p_refresh_token_auth_tag text,
  p_encryption_version smallint,
  p_client_endpoint text,
  p_access_token_expires_at timestamptz
)
returns table (
  outcome public.bitrix24_credential_rotation_outcome,
  token_version bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_credential public.bitrix24_user_credentials%rowtype;
begin
  if p_portal_installation_id is null or p_profile_id is null
    or p_expected_token_version is null or p_expected_token_version < 1
  then
    raise exception using errcode = '22023', message = 'invalid credential rotation identity';
  end if;

  select credential.* into v_credential
  from public.bitrix24_user_credentials as credential
  where credential.profile_id = p_profile_id
    and credential.portal_installation_id = p_portal_installation_id
  for update;

  if not found then
    return query select 'unknown'::public.bitrix24_credential_rotation_outcome, null::bigint;
    return;
  end if;

  select profile.* into v_profile
  from public.profiles as profile
  where profile.id = p_profile_id
    and profile.portal_installation_id = p_portal_installation_id
  for update;

  if not found or not v_profile.is_active or not v_profile.bitrix_active
    or v_profile.bitrix_user_type <> 'employee'
  then
    return query select 'profile_inactive'::public.bitrix24_credential_rotation_outcome, null::bigint;
    return;
  end if;

  if v_credential.status = 'reauth_required' then
    return query select 'reauth_required'::public.bitrix24_credential_rotation_outcome, null::bigint;
    return;
  end if;
  if v_credential.status = 'disabled' then
    return query select 'disabled'::public.bitrix24_credential_rotation_outcome, null::bigint;
    return;
  end if;
  if v_credential.token_version <> p_expected_token_version then
    return query select 'version_conflict'::public.bitrix24_credential_rotation_outcome, null::bigint;
    return;
  end if;

  update public.bitrix24_user_credentials as credential
  set access_token_ciphertext = p_access_token_ciphertext,
      access_token_iv = p_access_token_iv,
      access_token_auth_tag = p_access_token_auth_tag,
      refresh_token_ciphertext = p_refresh_token_ciphertext,
      refresh_token_iv = p_refresh_token_iv,
      refresh_token_auth_tag = p_refresh_token_auth_tag,
      encryption_version = p_encryption_version,
      token_version = p_expected_token_version + 1,
      client_endpoint = p_client_endpoint,
      access_token_expires_at = p_access_token_expires_at,
      updated_at = clock_timestamp()
  where credential.id = v_credential.id
  returning credential.token_version into v_credential.token_version;

  return query select 'rotated'::public.bitrix24_credential_rotation_outcome, v_credential.token_version;
end;
$$;

create function public.mark_bitrix24_credentials_reauth_required(
  p_portal_installation_id smallint,
  p_profile_id uuid,
  p_expected_token_version bigint
)
returns table (outcome public.bitrix24_credential_reauth_outcome)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_credential public.bitrix24_user_credentials%rowtype;
  v_now timestamptz;
begin
  if p_portal_installation_id is null or p_profile_id is null
    or p_expected_token_version is null or p_expected_token_version < 1
  then
    raise exception using errcode = '22023', message = 'invalid credential reauth identity';
  end if;

  select credential.* into v_credential
  from public.bitrix24_user_credentials as credential
  where credential.profile_id = p_profile_id
    and credential.portal_installation_id = p_portal_installation_id
  for update;

  if not found then
    return query select 'unknown'::public.bitrix24_credential_reauth_outcome;
    return;
  end if;

  if v_credential.token_version <> p_expected_token_version then
    return query select 'version_conflict'::public.bitrix24_credential_reauth_outcome;
    return;
  end if;

  select profile.* into v_profile
  from public.profiles as profile
  where profile.id = p_profile_id
    and profile.portal_installation_id = p_portal_installation_id
  for update;

  if not found or not v_profile.is_active or not v_profile.bitrix_active
    or v_profile.bitrix_user_type <> 'employee'
  then
    return query select 'profile_inactive'::public.bitrix24_credential_reauth_outcome;
    return;
  end if;

  if v_credential.status = 'reauth_required' then
    return query select 'already_reauth_required'::public.bitrix24_credential_reauth_outcome;
    return;
  end if;
  if v_credential.status = 'disabled' then
    return query select 'disabled'::public.bitrix24_credential_reauth_outcome;
    return;
  end if;

  v_now := clock_timestamp();
  update public.bitrix24_user_credentials as credential
  set status = 'reauth_required', reauth_required_at = v_now, updated_at = v_now
  where credential.id = v_credential.id;

  return query select 'marked'::public.bitrix24_credential_reauth_outcome;
end;
$$;

revoke all on function public.create_bitrix24_user_credentials(
  smallint, uuid, text, text, text, text, text, text, smallint, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.resolve_bitrix24_user_credentials(smallint, uuid)
  from public, anon, authenticated;
revoke all on function public.rotate_bitrix24_user_credentials(
  smallint, uuid, bigint, text, text, text, text, text, text, smallint, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.mark_bitrix24_credentials_reauth_required(smallint, uuid, bigint)
  from public, anon, authenticated;

grant execute on function public.create_bitrix24_user_credentials(
  smallint, uuid, text, text, text, text, text, text, smallint, text, timestamptz
) to service_role;
grant execute on function public.resolve_bitrix24_user_credentials(smallint, uuid) to service_role;
grant execute on function public.rotate_bitrix24_user_credentials(
  smallint, uuid, bigint, text, text, text, text, text, text, smallint, text, timestamptz
) to service_role;
grant execute on function public.mark_bitrix24_credentials_reauth_required(smallint, uuid, bigint)
  to service_role;
