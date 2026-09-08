create or replace function public.replace_bitrix24_credentials_after_verified_oauth(
  p_portal_installation_id smallint,
  p_profile_id uuid,
  p_expected_current_token_version bigint,
  p_new_token_version bigint,
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
  outcome public.bitrix24_credential_oauth_replacement_outcome,
  token_version bigint
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
  if p_portal_installation_id is null or p_profile_id is null
    or p_new_token_version is null or p_new_token_version < 1
  then
    raise exception using errcode = '22023', message = 'invalid verified oauth credential replacement';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_portal_installation_id::text || ':' || p_profile_id::text, 0)
  );

  select credential.* into v_credential
  from public.bitrix24_user_credentials as credential
  where credential.profile_id = p_profile_id
    and credential.portal_installation_id = p_portal_installation_id
  for update;

  if found then
    select profile.* into v_profile
    from public.profiles as profile
    where profile.id = p_profile_id
      and profile.portal_installation_id = p_portal_installation_id
    for no key update;
  else
    select profile.* into v_profile
    from public.profiles as profile
    where profile.id = p_profile_id
      and profile.portal_installation_id = p_portal_installation_id
    for no key update;

    if found then
      select credential.* into v_credential
      from public.bitrix24_user_credentials as credential
      where credential.profile_id = p_profile_id
        and credential.portal_installation_id = p_portal_installation_id
      for update;
    end if;
  end if;

  if v_profile.id is null then
    return query select 'profile_unknown'::public.bitrix24_credential_oauth_replacement_outcome,
      null::bigint;
    return;
  end if;

  if not v_profile.is_active or not v_profile.bitrix_active
    or v_profile.bitrix_user_type <> 'employee'
  then
    return query select 'profile_inactive'::public.bitrix24_credential_oauth_replacement_outcome,
      null::bigint;
    return;
  end if;

  v_now := clock_timestamp();
  if v_credential.id is null then
    if p_expected_current_token_version is not null or p_new_token_version <> 1 then
      return query select 'version_conflict'::public.bitrix24_credential_oauth_replacement_outcome,
        null::bigint;
      return;
    end if;

    insert into public.bitrix24_user_credentials (
      portal_installation_id, profile_id,
      access_token_ciphertext, access_token_iv, access_token_auth_tag,
      refresh_token_ciphertext, refresh_token_iv, refresh_token_auth_tag,
      encryption_version, token_version, client_endpoint, access_token_expires_at,
      status, reauth_required_at, created_at, updated_at
    ) values (
      p_portal_installation_id, p_profile_id,
      p_access_token_ciphertext, p_access_token_iv, p_access_token_auth_tag,
      p_refresh_token_ciphertext, p_refresh_token_iv, p_refresh_token_auth_tag,
      p_encryption_version, 1, p_client_endpoint, p_access_token_expires_at,
      'active', null, v_now, v_now
    );
    return query select 'created'::public.bitrix24_credential_oauth_replacement_outcome, 1::bigint;
    return;
  end if;

  if v_credential.status = 'disabled' then
    return query select 'disabled'::public.bitrix24_credential_oauth_replacement_outcome,
      null::bigint;
    return;
  end if;

  if p_expected_current_token_version is null
    or p_expected_current_token_version <> v_credential.token_version
    or p_new_token_version <> v_credential.token_version + 1
  then
    return query select 'version_conflict'::public.bitrix24_credential_oauth_replacement_outcome,
      null::bigint;
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
      token_version = p_new_token_version,
      client_endpoint = p_client_endpoint,
      access_token_expires_at = p_access_token_expires_at,
      status = 'active',
      reauth_required_at = null,
      updated_at = v_now
  where credential.id = v_credential.id;

  return query select 'replaced'::public.bitrix24_credential_oauth_replacement_outcome,
    p_new_token_version;
end;
$$;

create or replace function public.block_profile(
  p_actor_session_token_hash text,
  p_target_profile_id uuid
)
returns table (
  outcome public.profile_block_outcome,
  sessions_revoked integer,
  credentials_disabled integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.app_sessions%rowtype;
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_credential public.bitrix24_user_credentials%rowtype;
  v_now timestamptz;
  v_sessions_revoked integer := 0;
  v_credentials_disabled integer := 0;
  v_was_active boolean;
begin
  if p_actor_session_token_hash is null
    or p_actor_session_token_hash !~ '^[0-9a-f]{64}$'
    or p_target_profile_id is null
  then
    raise exception using errcode = '22023', message = 'invalid profile block input';
  end if;

  select session.* into v_session
  from public.app_sessions as session
  where session.token_hash = p_actor_session_token_hash;

  if not found then
    return query select 'unauthorized'::public.profile_block_outcome, 0, 0;
    return;
  end if;

  perform 1
  from public.portal_installations as installation
  where installation.singleton_key = v_session.portal_installation_id
  for no key update;

  select session.* into v_session
  from public.app_sessions as session
  where session.token_hash = p_actor_session_token_hash
  for update;

  v_now := clock_timestamp();
  if not found or v_session.revoked_at is not null or v_session.expires_at <= v_now then
    return query select 'unauthorized'::public.profile_block_outcome, 0, 0;
    return;
  end if;

  select profile.* into v_actor
  from public.profiles as profile
  where profile.id = v_session.profile_id
    and profile.portal_installation_id = v_session.portal_installation_id;

  if not found or not v_actor.is_active or not v_actor.bitrix_active
    or v_actor.bitrix_user_type <> 'employee' or v_actor.role <> 'administrator'
  then
    return query select 'unauthorized'::public.profile_block_outcome, 0, 0;
    return;
  end if;

  select credential.* into v_credential
  from public.bitrix24_user_credentials as credential
  where credential.profile_id = p_target_profile_id
    and credential.portal_installation_id = v_session.portal_installation_id
  for update;

  select profile.* into v_target
  from public.profiles as profile
  where profile.id = p_target_profile_id
    and profile.portal_installation_id = v_session.portal_installation_id
  for update;

  if not found then
    return query select 'target_unknown'::public.profile_block_outcome, 0, 0;
    return;
  end if;

  select credential.* into v_credential
  from public.bitrix24_user_credentials as credential
  where credential.profile_id = p_target_profile_id
    and credential.portal_installation_id = v_session.portal_installation_id
  for update;

  v_was_active := v_target.is_active;
  if v_was_active and v_target.role = 'administrator' and not exists (
    select 1
    from public.profiles as administrator
    where administrator.portal_installation_id = v_session.portal_installation_id
      and administrator.id <> v_target.id
      and administrator.role = 'administrator'
      and administrator.is_active
      and administrator.bitrix_active
      and administrator.bitrix_user_type = 'employee'
  ) then
    return query select 'last_administrator'::public.profile_block_outcome, 0, 0;
    return;
  end if;

  if v_was_active then
    update public.profiles as profile
    set is_active = false, updated_at = v_now
    where profile.id = v_target.id;
  end if;

  update public.app_sessions as session
  set revoked_at = v_now
  where session.profile_id = v_target.id
    and session.portal_installation_id = v_target.portal_installation_id
    and session.revoked_at is null
    and session.expires_at > v_now;
  get diagnostics v_sessions_revoked = row_count;

  update public.bitrix24_user_credentials as credential
  set status = 'disabled', reauth_required_at = null, updated_at = v_now
  where credential.profile_id = v_target.id
    and credential.portal_installation_id = v_target.portal_installation_id
    and credential.status <> 'disabled';
  get diagnostics v_credentials_disabled = row_count;

  return query select
    case
      when v_was_active then 'blocked'::public.profile_block_outcome
      else 'already_blocked'::public.profile_block_outcome
    end,
    v_sessions_revoked,
    v_credentials_disabled;
end;
$$;
