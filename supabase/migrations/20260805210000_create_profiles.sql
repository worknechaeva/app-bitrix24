create type public.profile_reconciliation_outcome as enum (
  'created',
  'unchanged',
  'snapshot_updated',
  'inactive'
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  portal_installation_id smallint not null,
  bitrix_user_id text not null,
  role text not null default 'editor',
  is_active boolean not null default true,
  bitrix_active boolean not null,
  bitrix_user_type text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  last_identity_verified_at timestamptz not null default clock_timestamp(),
  constraint profiles_portal_installation_fk foreign key (portal_installation_id)
    references public.portal_installations (singleton_key)
    on update restrict
    on delete restrict,
  constraint profiles_external_identity_key unique (portal_installation_id, bitrix_user_id),
  constraint profiles_bitrix_user_id_check check (
    char_length(bitrix_user_id) between 1 and 64
    and bitrix_user_id ~ '^[1-9][0-9]*$'
  ),
  constraint profiles_role_check check (role in ('editor', 'administrator')),
  constraint profiles_bitrix_user_type_check check (char_length(bitrix_user_type) between 1 and 64),
  constraint profiles_timestamps_check check (
    updated_at >= created_at
    and last_identity_verified_at >= created_at
  )
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.profiles from service_role;
grant select, insert, update on table public.profiles to service_role;

create function public.reconcile_profile(
  p_portal_installation_id smallint,
  p_bitrix_user_id text,
  p_bitrix_active boolean,
  p_bitrix_user_type text
)
returns table (
  outcome public.profile_reconciliation_outcome,
  id uuid,
  portal_installation_id smallint,
  bitrix_user_id text,
  role text,
  is_active boolean,
  bitrix_active boolean,
  bitrix_user_type text,
  last_identity_verified_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_snapshot_changed boolean;
  v_verified_at timestamptz;
begin
  if p_portal_installation_id is null or p_portal_installation_id <> 1 then
    raise exception using errcode = '22023', message = 'invalid portal installation';
  end if;

  if p_bitrix_user_id is null
    or char_length(p_bitrix_user_id) not between 1 and 64
    or p_bitrix_user_id !~ '^[1-9][0-9]*$'
  then
    raise exception using errcode = '22023', message = 'invalid Bitrix24 user id';
  end if;

  if p_bitrix_active is distinct from true or p_bitrix_user_type is distinct from 'employee' then
    raise exception using errcode = '22023', message = 'identity is not a verified active employee';
  end if;

  v_verified_at := clock_timestamp();

  insert into public.profiles (
    portal_installation_id,
    bitrix_user_id,
    bitrix_active,
    bitrix_user_type,
    last_identity_verified_at,
    created_at,
    updated_at
  )
  values (
    p_portal_installation_id,
    p_bitrix_user_id,
    p_bitrix_active,
    p_bitrix_user_type,
    v_verified_at,
    v_verified_at,
    v_verified_at
  )
  on conflict on constraint profiles_external_identity_key do nothing
  returning * into v_profile;

  if found then
    return query
    select
      'created'::public.profile_reconciliation_outcome,
      v_profile.id,
      v_profile.portal_installation_id,
      v_profile.bitrix_user_id,
      v_profile.role,
      v_profile.is_active,
      v_profile.bitrix_active,
      v_profile.bitrix_user_type,
      v_profile.last_identity_verified_at,
      v_profile.created_at,
      v_profile.updated_at;
    return;
  end if;

  select profile.*
  into strict v_profile
  from public.profiles as profile
  where profile.portal_installation_id = p_portal_installation_id
    and profile.bitrix_user_id = p_bitrix_user_id
  for update;

  v_verified_at := clock_timestamp();
  v_snapshot_changed :=
    v_profile.bitrix_active is distinct from p_bitrix_active
    or v_profile.bitrix_user_type is distinct from p_bitrix_user_type;

  update public.profiles as profile
  set
    bitrix_active = p_bitrix_active,
    bitrix_user_type = p_bitrix_user_type,
    last_identity_verified_at = v_verified_at,
    updated_at = case when v_snapshot_changed then v_verified_at else profile.updated_at end
  where profile.id = v_profile.id
  returning profile.* into v_profile;

  return query
  select
    case
      when not v_profile.is_active then 'inactive'::public.profile_reconciliation_outcome
      when v_snapshot_changed then 'snapshot_updated'::public.profile_reconciliation_outcome
      else 'unchanged'::public.profile_reconciliation_outcome
    end,
    v_profile.id,
    v_profile.portal_installation_id,
    v_profile.bitrix_user_id,
    v_profile.role,
    v_profile.is_active,
    v_profile.bitrix_active,
    v_profile.bitrix_user_type,
    v_profile.last_identity_verified_at,
    v_profile.created_at,
    v_profile.updated_at;
end;
$$;

revoke all on function public.reconcile_profile(smallint, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_profile(smallint, text, boolean, text) to service_role;
