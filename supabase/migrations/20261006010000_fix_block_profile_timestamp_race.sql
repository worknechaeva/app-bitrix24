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
  v_write_at timestamptz;
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

  v_write_at := clock_timestamp();
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
    set is_active = false, updated_at = greatest(v_write_at, profile.created_at)
    where profile.id = v_target.id;
  end if;

  update public.app_sessions as session
  set revoked_at = greatest(v_write_at, session.created_at)
  where session.profile_id = v_target.id
    and session.portal_installation_id = v_target.portal_installation_id
    and session.revoked_at is null
    and session.expires_at > v_write_at;
  get diagnostics v_sessions_revoked = row_count;

  update public.bitrix24_user_credentials as credential
  set status = 'disabled', reauth_required_at = null,
      updated_at = greatest(v_write_at, credential.created_at)
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
