alter table public.portal_installations
  add column admin_bootstrapped_at timestamptz,
  add constraint portal_installations_admin_bootstrapped_at_check check (
    admin_bootstrapped_at is null or admin_bootstrapped_at >= created_at
  );

create type public.first_administrator_bootstrap_outcome as enum (
  'promoted',
  'already_administrator',
  'active_administrator_exists',
  'already_completed',
  'profile_unknown',
  'profile_inactive',
  'identity_mismatch'
);

create type public.profile_role_change_outcome as enum (
  'updated',
  'unchanged',
  'unauthorized',
  'target_unknown',
  'target_inactive',
  'last_administrator'
);

create type public.profile_block_outcome as enum (
  'blocked',
  'already_blocked',
  'unauthorized',
  'target_unknown',
  'last_administrator'
);

create function public.bootstrap_first_administrator(
  p_portal_installation_id smallint,
  p_profile_id uuid,
  p_verified_bitrix_user_id text
)
returns table (
  outcome public.first_administrator_bootstrap_outcome,
  role text,
  admin_bootstrapped_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_installation public.portal_installations%rowtype;
  v_profile public.profiles%rowtype;
  v_now timestamptz;
begin
  if p_portal_installation_id is null or p_portal_installation_id <> 1
    or p_profile_id is null
    or p_verified_bitrix_user_id is null
    or char_length(p_verified_bitrix_user_id) not between 1 and 64
    or p_verified_bitrix_user_id !~ '^[1-9][0-9]*$'
  then
    raise exception using errcode = '22023', message = 'invalid first administrator bootstrap input';
  end if;

  select installation.* into v_installation
  from public.portal_installations as installation
  where installation.singleton_key = p_portal_installation_id
  for update;

  if not found then
    return query select 'profile_unknown'::public.first_administrator_bootstrap_outcome,
      null::text, null::timestamptz;
    return;
  end if;

  select profile.* into v_profile
  from public.profiles as profile
  where profile.id = p_profile_id
    and profile.portal_installation_id = p_portal_installation_id
  for update;

  if not found then
    return query select 'profile_unknown'::public.first_administrator_bootstrap_outcome,
      null::text, v_installation.admin_bootstrapped_at;
    return;
  end if;

  if v_profile.bitrix_user_id <> p_verified_bitrix_user_id then
    return query select 'identity_mismatch'::public.first_administrator_bootstrap_outcome,
      null::text, v_installation.admin_bootstrapped_at;
    return;
  end if;

  if not v_profile.is_active or not v_profile.bitrix_active
    or v_profile.bitrix_user_type <> 'employee'
  then
    return query select 'profile_inactive'::public.first_administrator_bootstrap_outcome,
      null::text, v_installation.admin_bootstrapped_at;
    return;
  end if;

  if v_installation.admin_bootstrapped_at is not null then
    return query select
      case
        when v_profile.role = 'administrator'
          then 'already_administrator'::public.first_administrator_bootstrap_outcome
        else 'already_completed'::public.first_administrator_bootstrap_outcome
      end,
      v_profile.role,
      v_installation.admin_bootstrapped_at;
    return;
  end if;

  v_now := clock_timestamp();

  if v_profile.role = 'administrator' then
    update public.portal_installations as installation
    set admin_bootstrapped_at = v_now, updated_at = v_now
    where installation.singleton_key = p_portal_installation_id
    returning installation.admin_bootstrapped_at into v_installation.admin_bootstrapped_at;

    return query select 'already_administrator'::public.first_administrator_bootstrap_outcome,
      v_profile.role, v_installation.admin_bootstrapped_at;
    return;
  end if;

  if exists (
    select 1
    from public.profiles as administrator
    where administrator.portal_installation_id = p_portal_installation_id
      and administrator.role = 'administrator'
      and administrator.is_active
      and administrator.bitrix_active
      and administrator.bitrix_user_type = 'employee'
  ) then
    update public.portal_installations as installation
    set admin_bootstrapped_at = v_now, updated_at = v_now
    where installation.singleton_key = p_portal_installation_id
    returning installation.admin_bootstrapped_at into v_installation.admin_bootstrapped_at;

    return query select 'active_administrator_exists'::public.first_administrator_bootstrap_outcome,
      v_profile.role, v_installation.admin_bootstrapped_at;
    return;
  end if;

  update public.profiles as profile
  set role = 'administrator', updated_at = v_now
  where profile.id = v_profile.id
  returning profile.role into v_profile.role;

  update public.portal_installations as installation
  set admin_bootstrapped_at = v_now, updated_at = v_now
  where installation.singleton_key = p_portal_installation_id
  returning installation.admin_bootstrapped_at into v_installation.admin_bootstrapped_at;

  return query select 'promoted'::public.first_administrator_bootstrap_outcome,
    v_profile.role, v_installation.admin_bootstrapped_at;
end;
$$;

create function public.change_profile_role(
  p_actor_session_token_hash text,
  p_target_profile_id uuid,
  p_new_role text
)
returns table (
  outcome public.profile_role_change_outcome,
  role text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.app_sessions%rowtype;
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_now timestamptz;
begin
  if p_actor_session_token_hash is null
    or p_actor_session_token_hash !~ '^[0-9a-f]{64}$'
    or p_target_profile_id is null
    or p_new_role is null
    or p_new_role not in ('editor', 'administrator')
  then
    raise exception using errcode = '22023', message = 'invalid profile role change input';
  end if;

  select session.* into v_session
  from public.app_sessions as session
  where session.token_hash = p_actor_session_token_hash;

  if not found then
    return query select 'unauthorized'::public.profile_role_change_outcome, null::text;
    return;
  end if;

  perform 1
  from public.portal_installations as installation
  where installation.singleton_key = v_session.portal_installation_id
  for update;

  select session.* into v_session
  from public.app_sessions as session
  where session.token_hash = p_actor_session_token_hash
  for update;

  v_now := clock_timestamp();
  if not found or v_session.revoked_at is not null or v_session.expires_at <= v_now then
    return query select 'unauthorized'::public.profile_role_change_outcome, null::text;
    return;
  end if;

  select profile.* into v_actor
  from public.profiles as profile
  where profile.id = v_session.profile_id
    and profile.portal_installation_id = v_session.portal_installation_id;

  if not found or not v_actor.is_active or not v_actor.bitrix_active
    or v_actor.bitrix_user_type <> 'employee' or v_actor.role <> 'administrator'
  then
    return query select 'unauthorized'::public.profile_role_change_outcome, null::text;
    return;
  end if;

  select profile.* into v_target
  from public.profiles as profile
  where profile.id = p_target_profile_id
    and profile.portal_installation_id = v_session.portal_installation_id
  for update;

  if not found then
    return query select 'target_unknown'::public.profile_role_change_outcome, null::text;
    return;
  end if;

  if not v_target.is_active or not v_target.bitrix_active
    or v_target.bitrix_user_type <> 'employee'
  then
    return query select 'target_inactive'::public.profile_role_change_outcome, null::text;
    return;
  end if;

  if v_target.role = p_new_role then
    return query select 'unchanged'::public.profile_role_change_outcome, v_target.role;
    return;
  end if;

  if v_target.role = 'administrator' and p_new_role = 'editor' and not exists (
    select 1
    from public.profiles as administrator
    where administrator.portal_installation_id = v_session.portal_installation_id
      and administrator.id <> v_target.id
      and administrator.role = 'administrator'
      and administrator.is_active
      and administrator.bitrix_active
      and administrator.bitrix_user_type = 'employee'
  ) then
    return query select 'last_administrator'::public.profile_role_change_outcome, v_target.role;
    return;
  end if;

  update public.profiles as profile
  set role = p_new_role, updated_at = v_now
  where profile.id = v_target.id
  returning profile.role into v_target.role;

  return query select 'updated'::public.profile_role_change_outcome, v_target.role;
end;
$$;

create function public.block_profile(
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
  for update;

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

revoke all on function public.bootstrap_first_administrator(smallint, uuid, text)
  from public, anon, authenticated;
revoke all on function public.change_profile_role(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.block_profile(text, uuid)
  from public, anon, authenticated;

grant execute on function public.bootstrap_first_administrator(smallint, uuid, text)
  to service_role;
grant execute on function public.change_profile_role(text, uuid, text)
  to service_role;
grant execute on function public.block_profile(text, uuid)
  to service_role;
