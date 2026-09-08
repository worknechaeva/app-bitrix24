alter table public.launcher_projects
  add column creation_operation_key uuid;

alter table public.launcher_projects
  add constraint launcher_projects_owner_creation_operation_key
  unique (portal_installation_id, owner_profile_id, creation_operation_key);

drop function public.save_launcher_project(
  text, uuid, text, text, text, public.launcher_project_entity_type, text, text, text
);

create function public.save_launcher_project(
  p_actor_session_token_hash text,
  p_project_id uuid,
  p_creation_operation_key uuid,
  p_name text,
  p_website_url text,
  p_bitrix_entity_id text,
  p_bitrix_entity_type public.launcher_project_entity_type,
  p_bitrix_entity_title text,
  p_required_tag text,
  p_default_responsible_id text
)
returns table (outcome public.launcher_project_mutation_outcome, project_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.app_sessions%rowtype;
  v_actor public.profiles%rowtype;
  v_project public.launcher_projects%rowtype;
  v_now timestamptz;
begin
  if p_actor_session_token_hash is null
    or p_actor_session_token_hash !~ '^[0-9a-f]{64}$'
    or (p_project_id is null and p_creation_operation_key is null)
    or (p_project_id is not null and p_creation_operation_key is not null) then
    raise exception using errcode = '22023', message = 'invalid launcher project save input';
  end if;

  select s.* into v_session
  from public.app_sessions s
  where s.token_hash = p_actor_session_token_hash;
  if not found then
    return query select 'unauthorized'::public.launcher_project_mutation_outcome, null::uuid;
    return;
  end if;

  perform 1
  from public.portal_installations pi
  where pi.singleton_key = v_session.portal_installation_id
  for update;

  select s.* into v_session
  from public.app_sessions s
  where s.token_hash = p_actor_session_token_hash
  for update;
  v_now := clock_timestamp();
  if not found or v_session.revoked_at is not null or v_session.expires_at <= v_now then
    return query select 'unauthorized'::public.launcher_project_mutation_outcome, null::uuid;
    return;
  end if;

  select p.* into v_actor
  from public.profiles p
  where p.id = v_session.profile_id
    and p.portal_installation_id = v_session.portal_installation_id
  for update;
  if not found
    or not v_actor.is_active
    or not v_actor.bitrix_active
    or v_actor.bitrix_user_type <> 'employee' then
    return query select 'unauthorized'::public.launcher_project_mutation_outcome, null::uuid;
    return;
  end if;

  if p_project_id is null then
    select lp.* into v_project
    from public.launcher_projects lp
    where lp.portal_installation_id = v_actor.portal_installation_id
      and lp.owner_profile_id = v_actor.id
      and lp.creation_operation_key = p_creation_operation_key
    for update;

    if found then
      if v_project.name = p_name
        and v_project.website_url is not distinct from nullif(p_website_url, '')
        and v_project.bitrix_entity_id = p_bitrix_entity_id
        and v_project.required_tag = p_required_tag
        and v_project.default_responsible_id = p_default_responsible_id then
        return query select 'unchanged'::public.launcher_project_mutation_outcome, v_project.id;
      else
        return query select 'forbidden'::public.launcher_project_mutation_outcome, v_project.id;
      end if;
      return;
    end if;

    insert into public.launcher_projects (
      portal_installation_id,
      owner_profile_id,
      creation_operation_key,
      name,
      website_url,
      bitrix_entity_id,
      bitrix_entity_type,
      bitrix_entity_title,
      required_tag,
      default_responsible_id,
      created_at,
      updated_at
    ) values (
      v_actor.portal_installation_id,
      v_actor.id,
      p_creation_operation_key,
      p_name,
      nullif(p_website_url, ''),
      p_bitrix_entity_id,
      p_bitrix_entity_type,
      p_bitrix_entity_title,
      p_required_tag,
      p_default_responsible_id,
      v_now,
      v_now
    ) returning * into v_project;
    return query select 'created'::public.launcher_project_mutation_outcome, v_project.id;
    return;
  end if;

  select lp.* into v_project
  from public.launcher_projects lp
  where lp.id = p_project_id
    and lp.portal_installation_id = v_actor.portal_installation_id
  for update;
  if not found then
    return query select 'not_found'::public.launcher_project_mutation_outcome, null::uuid;
    return;
  end if;
  if v_project.owner_profile_id <> v_actor.id then
    return query select 'forbidden'::public.launcher_project_mutation_outcome, v_project.id;
    return;
  end if;

  update public.launcher_projects lp
  set name = p_name,
    website_url = nullif(p_website_url, ''),
    bitrix_entity_id = p_bitrix_entity_id,
    bitrix_entity_type = p_bitrix_entity_type,
    bitrix_entity_title = p_bitrix_entity_title,
    required_tag = p_required_tag,
    default_responsible_id = p_default_responsible_id,
    updated_at = v_now
  where lp.id = v_project.id;
  return query select 'updated'::public.launcher_project_mutation_outcome, v_project.id;
end;
$$;

revoke all on function public.save_launcher_project(
  text, uuid, uuid, text, text, text, public.launcher_project_entity_type, text, text, text
) from public, anon, authenticated;
grant execute on function public.save_launcher_project(
  text, uuid, uuid, text, text, text, public.launcher_project_entity_type, text, text, text
) to service_role;
