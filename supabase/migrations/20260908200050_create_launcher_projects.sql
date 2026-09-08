create type public.launcher_project_entity_type as enum ('group', 'project', 'scrum');
create type public.launcher_project_archive_action as enum ('archived', 'restored');
create type public.launcher_project_mutation_outcome as enum (
  'created', 'updated', 'archived', 'restored', 'unchanged', 'unauthorized', 'not_found', 'forbidden'
);

create table public.launcher_projects (
  id uuid primary key default gen_random_uuid(),
  portal_installation_id smallint not null,
  owner_profile_id uuid not null,
  name text not null,
  website_url text,
  bitrix_entity_id text not null,
  bitrix_entity_type public.launcher_project_entity_type not null,
  bitrix_entity_title text not null,
  required_tag text not null,
  default_responsible_id text not null,
  archived_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint launcher_projects_portal_fk foreign key (portal_installation_id)
    references public.portal_installations (singleton_key) on update restrict on delete restrict,
  constraint launcher_projects_owner_portal_fk foreign key (owner_profile_id, portal_installation_id)
    references public.profiles (id, portal_installation_id) on update restrict on delete restrict,
  constraint launcher_projects_name_check check (char_length(name) between 2 and 120 and name = btrim(name)),
  constraint launcher_projects_website_check check (
    website_url is null or (char_length(website_url) <= 2048 and website_url ~ '^https?://')
  ),
  constraint launcher_projects_entity_id_check check (bitrix_entity_id ~ '^[1-9][0-9]{0,63}$'),
  constraint launcher_projects_entity_title_check check (
    char_length(bitrix_entity_title) between 1 and 160 and bitrix_entity_title = btrim(bitrix_entity_title)
  ),
  constraint launcher_projects_required_tag_check check (
    char_length(required_tag) between 1 and 100 and required_tag = btrim(required_tag)
  ),
  constraint launcher_projects_responsible_check check (default_responsible_id ~ '^[1-9][0-9]{0,63}$'),
  constraint launcher_projects_id_portal_key unique (id, portal_installation_id),
  constraint launcher_projects_timestamps_check check (
    updated_at >= created_at and (archived_at is null or archived_at >= created_at)
  )
);

create index launcher_projects_owner_index
  on public.launcher_projects (portal_installation_id, owner_profile_id, archived_at, updated_at desc);

create table public.launcher_project_audit_events (
  id bigint generated always as identity primary key,
  launcher_project_id uuid not null,
  portal_installation_id smallint not null,
  actor_profile_id uuid not null,
  action public.launcher_project_archive_action not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint launcher_project_audit_project_portal_fk foreign key (launcher_project_id, portal_installation_id)
    references public.launcher_projects (id, portal_installation_id) on update restrict on delete restrict,
  constraint launcher_project_audit_actor_portal_fk foreign key (actor_profile_id, portal_installation_id)
    references public.profiles (id, portal_installation_id) on update restrict on delete restrict
);

alter table public.launcher_projects enable row level security;
alter table public.launcher_project_audit_events enable row level security;
revoke all on table public.launcher_projects from public, anon, authenticated, service_role;
revoke all on table public.launcher_project_audit_events from public, anon, authenticated, service_role;
revoke all on sequence public.launcher_project_audit_events_id_seq from public, anon, authenticated, service_role;
grant select, insert, update on table public.launcher_projects to service_role;
grant select, insert on table public.launcher_project_audit_events to service_role;
grant usage, select on sequence public.launcher_project_audit_events_id_seq to service_role;

create function public.list_launcher_projects(p_actor_session_token_hash text)
returns table (
  id uuid, owner_profile_id uuid, name text, website_url text, bitrix_entity_id text,
  bitrix_entity_type public.launcher_project_entity_type, bitrix_entity_title text,
  required_tag text, default_responsible_id text, archived_at timestamptz,
  created_at timestamptz, updated_at timestamptz, can_edit boolean, can_archive boolean
)
language plpgsql security invoker set search_path = '' as $$
declare v_session public.app_sessions%rowtype; v_actor public.profiles%rowtype; v_now timestamptz;
begin
  if p_actor_session_token_hash is null or p_actor_session_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid launcher project session hash';
  end if;
  v_now := clock_timestamp();
  select s.* into v_session from public.app_sessions s where s.token_hash = p_actor_session_token_hash;
  if not found or v_session.revoked_at is not null or v_session.expires_at <= v_now then return; end if;
  select p.* into v_actor from public.profiles p
    where p.id = v_session.profile_id and p.portal_installation_id = v_session.portal_installation_id;
  if not found or not v_actor.is_active or not v_actor.bitrix_active or v_actor.bitrix_user_type <> 'employee' then return; end if;
  return query select lp.id, lp.owner_profile_id, lp.name, lp.website_url, lp.bitrix_entity_id,
    lp.bitrix_entity_type, lp.bitrix_entity_title, lp.required_tag, lp.default_responsible_id,
    lp.archived_at, lp.created_at, lp.updated_at,
    lp.owner_profile_id = v_actor.id,
    (lp.owner_profile_id = v_actor.id or v_actor.role = 'administrator')
  from public.launcher_projects lp
  where lp.portal_installation_id = v_actor.portal_installation_id
    and (v_actor.role = 'administrator' or lp.owner_profile_id = v_actor.id)
  order by lp.updated_at desc, lp.id;
end; $$;

create function public.save_launcher_project(
  p_actor_session_token_hash text, p_project_id uuid, p_name text, p_website_url text,
  p_bitrix_entity_id text, p_bitrix_entity_type public.launcher_project_entity_type,
  p_bitrix_entity_title text, p_required_tag text, p_default_responsible_id text
)
returns table (outcome public.launcher_project_mutation_outcome, project_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare v_session public.app_sessions%rowtype; v_actor public.profiles%rowtype;
  v_project public.launcher_projects%rowtype; v_now timestamptz;
begin
  if p_actor_session_token_hash is null or p_actor_session_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid launcher project session hash';
  end if;
  select s.* into v_session from public.app_sessions s where s.token_hash = p_actor_session_token_hash;
  if not found then return query select 'unauthorized'::public.launcher_project_mutation_outcome, null::uuid; return; end if;
  perform 1 from public.portal_installations pi where pi.singleton_key = v_session.portal_installation_id for update;
  select s.* into v_session from public.app_sessions s where s.token_hash = p_actor_session_token_hash for update;
  v_now := clock_timestamp();
  if not found or v_session.revoked_at is not null or v_session.expires_at <= v_now then
    return query select 'unauthorized'::public.launcher_project_mutation_outcome, null::uuid; return;
  end if;
  select p.* into v_actor from public.profiles p where p.id = v_session.profile_id
    and p.portal_installation_id = v_session.portal_installation_id for update;
  if not found or not v_actor.is_active or not v_actor.bitrix_active or v_actor.bitrix_user_type <> 'employee' then
    return query select 'unauthorized'::public.launcher_project_mutation_outcome, null::uuid; return;
  end if;
  if p_project_id is null then
    insert into public.launcher_projects (portal_installation_id, owner_profile_id, name, website_url,
      bitrix_entity_id, bitrix_entity_type, bitrix_entity_title, required_tag, default_responsible_id,
      created_at, updated_at)
    values (v_actor.portal_installation_id, v_actor.id, p_name, nullif(p_website_url, ''),
      p_bitrix_entity_id, p_bitrix_entity_type, p_bitrix_entity_title, p_required_tag,
      p_default_responsible_id, v_now, v_now) returning * into v_project;
    return query select 'created'::public.launcher_project_mutation_outcome, v_project.id; return;
  end if;
  select lp.* into v_project from public.launcher_projects lp
    where lp.id = p_project_id and lp.portal_installation_id = v_actor.portal_installation_id for update;
  if not found then return query select 'not_found'::public.launcher_project_mutation_outcome, null::uuid; return; end if;
  if v_project.owner_profile_id <> v_actor.id then
    return query select 'forbidden'::public.launcher_project_mutation_outcome, v_project.id; return;
  end if;
  update public.launcher_projects lp set name = p_name, website_url = nullif(p_website_url, ''),
    bitrix_entity_id = p_bitrix_entity_id, bitrix_entity_type = p_bitrix_entity_type,
    bitrix_entity_title = p_bitrix_entity_title, required_tag = p_required_tag,
    default_responsible_id = p_default_responsible_id, updated_at = v_now
  where lp.id = v_project.id;
  return query select 'updated'::public.launcher_project_mutation_outcome, v_project.id;
end; $$;

create function public.set_launcher_project_archived(
  p_actor_session_token_hash text, p_project_id uuid, p_archived boolean
)
returns table (outcome public.launcher_project_mutation_outcome, project_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare v_session public.app_sessions%rowtype; v_actor public.profiles%rowtype;
  v_project public.launcher_projects%rowtype; v_now timestamptz;
begin
  if p_actor_session_token_hash is null or p_actor_session_token_hash !~ '^[0-9a-f]{64}$'
    or p_project_id is null or p_archived is null then
    raise exception using errcode = '22023', message = 'invalid launcher project archive input';
  end if;
  select s.* into v_session from public.app_sessions s where s.token_hash = p_actor_session_token_hash;
  if not found then return query select 'unauthorized'::public.launcher_project_mutation_outcome, null::uuid; return; end if;
  perform 1 from public.portal_installations pi where pi.singleton_key = v_session.portal_installation_id for update;
  select s.* into v_session from public.app_sessions s where s.token_hash = p_actor_session_token_hash for update;
  v_now := clock_timestamp();
  if not found or v_session.revoked_at is not null or v_session.expires_at <= v_now then
    return query select 'unauthorized'::public.launcher_project_mutation_outcome, null::uuid; return;
  end if;
  select p.* into v_actor from public.profiles p where p.id = v_session.profile_id
    and p.portal_installation_id = v_session.portal_installation_id for update;
  if not found or not v_actor.is_active or not v_actor.bitrix_active or v_actor.bitrix_user_type <> 'employee' then
    return query select 'unauthorized'::public.launcher_project_mutation_outcome, null::uuid; return;
  end if;
  select lp.* into v_project from public.launcher_projects lp
    where lp.id = p_project_id and lp.portal_installation_id = v_actor.portal_installation_id for update;
  if not found then return query select 'not_found'::public.launcher_project_mutation_outcome, null::uuid; return; end if;
  if v_project.owner_profile_id <> v_actor.id and v_actor.role <> 'administrator' then
    return query select 'forbidden'::public.launcher_project_mutation_outcome, v_project.id; return;
  end if;
  if (p_archived and v_project.archived_at is not null) or (not p_archived and v_project.archived_at is null) then
    return query select 'unchanged'::public.launcher_project_mutation_outcome, v_project.id; return;
  end if;
  update public.launcher_projects lp set archived_at = case when p_archived then v_now else null end,
    updated_at = v_now where lp.id = v_project.id;
  insert into public.launcher_project_audit_events
    (launcher_project_id, portal_installation_id, actor_profile_id, action, created_at)
  values (v_project.id, v_project.portal_installation_id, v_actor.id,
    case when p_archived then 'archived'::public.launcher_project_archive_action
      else 'restored'::public.launcher_project_archive_action end, v_now);
  return query select case when p_archived then 'archived'::public.launcher_project_mutation_outcome
    else 'restored'::public.launcher_project_mutation_outcome end, v_project.id;
end; $$;

revoke all on function public.list_launcher_projects(text) from public, anon, authenticated;
revoke all on function public.save_launcher_project(text, uuid, text, text, text, public.launcher_project_entity_type, text, text, text) from public, anon, authenticated;
revoke all on function public.set_launcher_project_archived(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.list_launcher_projects(text) to service_role;
grant execute on function public.save_launcher_project(text, uuid, text, text, text, public.launcher_project_entity_type, text, text, text) to service_role;
grant execute on function public.set_launcher_project_archived(text, uuid, boolean) to service_role;
