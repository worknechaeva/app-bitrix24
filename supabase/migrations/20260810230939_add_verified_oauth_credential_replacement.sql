create type public.bitrix24_credential_oauth_inspection_outcome as enum (
  'missing',
  'replaceable',
  'disabled',
  'profile_unknown',
  'profile_inactive'
);

create type public.bitrix24_credential_oauth_replacement_outcome as enum (
  'created',
  'replaced',
  'version_conflict',
  'disabled',
  'profile_unknown',
  'profile_inactive'
);

create function public.inspect_bitrix24_credentials_for_verified_oauth(
  p_portal_installation_id smallint,
  p_profile_id uuid
)
returns table (
  outcome public.bitrix24_credential_oauth_inspection_outcome,
  current_token_version bigint,
  next_token_version bigint
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
    raise exception using errcode = '22023', message = 'invalid verified oauth credential identity';
  end if;

  select profile.* into v_profile
  from public.profiles as profile
  where profile.id = p_profile_id
    and profile.portal_installation_id = p_portal_installation_id;

  if not found then
    return query select 'profile_unknown'::public.bitrix24_credential_oauth_inspection_outcome,
      null::bigint, null::bigint;
    return;
  end if;

  if not v_profile.is_active or not v_profile.bitrix_active
    or v_profile.bitrix_user_type <> 'employee'
  then
    return query select 'profile_inactive'::public.bitrix24_credential_oauth_inspection_outcome,
      null::bigint, null::bigint;
    return;
  end if;

  select credential.* into v_credential
  from public.bitrix24_user_credentials as credential
  where credential.profile_id = p_profile_id
    and credential.portal_installation_id = p_portal_installation_id;

  if not found then
    return query select 'missing'::public.bitrix24_credential_oauth_inspection_outcome,
      null::bigint, 1::bigint;
    return;
  end if;

  if v_credential.status = 'disabled' then
    return query select 'disabled'::public.bitrix24_credential_oauth_inspection_outcome,
      null::bigint, null::bigint;
    return;
  end if;

  return query select 'replaceable'::public.bitrix24_credential_oauth_inspection_outcome,
    v_credential.token_version, v_credential.token_version + 1;
end;
$$;

create function public.replace_bitrix24_credentials_after_verified_oauth(
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
    for update;
  else
    select profile.* into v_profile
    from public.profiles as profile
    where profile.id = p_profile_id
      and profile.portal_installation_id = p_portal_installation_id
    for update;

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

revoke all on function public.inspect_bitrix24_credentials_for_verified_oauth(smallint, uuid)
  from public, anon, authenticated;
revoke all on function public.replace_bitrix24_credentials_after_verified_oauth(
  smallint, uuid, bigint, bigint, text, text, text, text, text, text, smallint, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.inspect_bitrix24_credentials_for_verified_oauth(smallint, uuid)
  to service_role;
grant execute on function public.replace_bitrix24_credentials_after_verified_oauth(
  smallint, uuid, bigint, bigint, text, text, text, text, text, text, smallint, text, timestamptz
) to service_role;
