begin;
select plan(20);
select has_table('public', 'launcher_projects', 'launcher projects table exists');
select has_table('public', 'launcher_project_audit_events', 'append-only audit table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.launcher_projects'::regclass), 'projects use RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.launcher_project_audit_events'::regclass), 'audit uses RLS');
select ok(not has_table_privilege('anon', 'public.launcher_projects', 'select') and not has_table_privilege('authenticated', 'public.launcher_projects', 'select'), 'browser roles cannot read projects');
select ok(not has_table_privilege('anon', 'public.launcher_project_audit_events', 'insert') and not has_table_privilege('authenticated', 'public.launcher_project_audit_events', 'insert'), 'browser roles cannot write audit');
select ok(has_function_privilege('service_role', 'public.list_launcher_projects(text)', 'execute'), 'service role lists through narrow RPC');
select ok(not has_function_privilege('anon', 'public.list_launcher_projects(text)', 'execute'), 'anon cannot list projects');
select ok(has_function_privilege('service_role', 'public.save_launcher_project(text,uuid,uuid,text,text,text,public.launcher_project_entity_type,text,text,text)', 'execute'), 'service role saves through narrow RPC');
select ok(not has_function_privilege('authenticated', 'public.save_launcher_project(text,uuid,uuid,text,text,text,public.launcher_project_entity_type,text,text,text)', 'execute'), 'authenticated cannot save projects');
select ok(
  not (select prosecdef from pg_proc where oid = 'public.save_launcher_project(text,uuid,uuid,text,text,text,public.launcher_project_entity_type,text,text,text)'::regprocedure),
  'save RPC uses security invoker'
);
select ok(
  (select count(*) = 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'save_launcher_project'),
  'save RPC has no unsupported overload'
);
select ok(has_function_privilege('service_role', 'public.set_launcher_project_archived(text,uuid,boolean)', 'execute'), 'service role archives through narrow RPC');
select ok(not (select prosecdef from pg_proc where oid = 'public.set_launcher_project_archived(text,uuid,boolean)'::regprocedure), 'archive RPC uses security invoker');
select ok(has_table_privilege('service_role', 'public.launcher_project_audit_events', 'insert'), 'service role can append audit events');
select ok(not has_table_privilege('service_role', 'public.launcher_project_audit_events', 'update') and not has_table_privilege('service_role', 'public.launcher_project_audit_events', 'delete'), 'service role cannot mutate or delete audit events');
select ok(not has_table_privilege('service_role', 'public.launcher_projects', 'delete'), 'service role cannot physically delete projects');
select ok(
  (select array_length(conkey, 1) = 2 from pg_constraint where conname = 'launcher_project_audit_project_portal_fk'),
  'audit project foreign key includes project and portal'
);
select col_type_is('public', 'launcher_projects', 'creation_operation_key', 'uuid', 'create operation key is a UUID');
select ok(
  (select count(*) = 1 from pg_constraint where conname = 'launcher_projects_owner_creation_operation_key'),
  'create operation key is unique per owner and portal'
);
select * from finish();
rollback;
