begin;

select plan(16);

select has_table('public', 'portal_installations', 'portal_installations exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.portal_installations'::regclass),
  'RLS is enabled'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'portal_installations'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'PUBLIC, anon, and authenticated have no table privileges'
);

select ok(has_table_privilege('service_role', 'public.portal_installations', 'select'), 'service_role can select');
select ok(has_table_privilege('service_role', 'public.portal_installations', 'insert'), 'service_role can insert');
select ok(has_table_privilege('service_role', 'public.portal_installations', 'update'), 'service_role can update');
select ok(not has_table_privilege('service_role', 'public.portal_installations', 'delete'), 'service_role cannot delete');

select ok(
  not has_function_privilege('anon', 'public.reconcile_portal_installation(text,text)', 'execute'),
  'anon cannot execute reconciliation'
);
select ok(
  not has_function_privilege('authenticated', 'public.reconcile_portal_installation(text,text)', 'execute'),
  'authenticated cannot execute reconciliation'
);
select ok(
  has_function_privilege('service_role', 'public.reconcile_portal_installation(text,text)', 'execute'),
  'service_role can execute reconciliation'
);
select ok(
  not exists (
    select 1
    from pg_proc as function
    cross join lateral aclexplode(coalesce(function.proacl, acldefault('f', function.proowner))) as privilege
    where function.oid = 'public.reconcile_portal_installation(text,text)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no execute privilege'
);

select ok(
  not (select prosecdef from pg_proc where oid = 'public.reconcile_portal_installation(text,text)'::regprocedure),
  'reconciliation uses security invoker'
);
select ok(
  exists (
    select 1
    from pg_proc as function
    cross join lateral unnest(function.proconfig) as setting
    where function.oid = 'public.reconcile_portal_installation(text,text)'::regprocedure
      and setting in ('search_path=', 'search_path=""')
  ),
  'reconciliation has an empty search_path'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.portal_installations'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (singleton_key)'
  ),
  'singleton_key is the primary key'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.portal_installations'::regclass
      and conname = 'portal_installations_singleton_key_check'
      and pg_get_constraintdef(oid) like '%singleton_key = 1%'
  ),
  'singleton_key is fixed to one'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.portal_installations'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (member_id)'
  ),
  'member_id is unique'
);

select * from finish();
rollback;
