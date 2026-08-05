begin;

select plan(24);

select has_table('public', 'profiles', 'profiles exists');
select col_type_is('public', 'profiles', 'id', 'uuid', 'profile ID is UUID');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'profiles'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'PUBLIC, anon, and authenticated have no table privileges'
);

select ok(has_table_privilege('service_role', 'public.profiles', 'select'), 'service_role can select');
select ok(has_table_privilege('service_role', 'public.profiles', 'insert'), 'service_role can insert');
select ok(has_table_privilege('service_role', 'public.profiles', 'update'), 'service_role can update');
select ok(not has_table_privilege('service_role', 'public.profiles', 'delete'), 'service_role cannot delete');
select ok(not has_table_privilege('service_role', 'public.profiles', 'truncate'), 'service_role cannot truncate');
select ok(not has_table_privilege('service_role', 'public.profiles', 'references'), 'service_role cannot add references');
select ok(not has_table_privilege('service_role', 'public.profiles', 'trigger'), 'service_role cannot add triggers');

select ok(
  not has_function_privilege('anon', 'public.reconcile_profile(smallint,text,boolean,text)', 'execute'),
  'anon cannot execute reconciliation'
);
select ok(
  not has_function_privilege('authenticated', 'public.reconcile_profile(smallint,text,boolean,text)', 'execute'),
  'authenticated cannot execute reconciliation'
);
select ok(
  has_function_privilege('service_role', 'public.reconcile_profile(smallint,text,boolean,text)', 'execute'),
  'service_role can execute reconciliation'
);
select ok(
  not exists (
    select 1
    from pg_proc as function
    cross join lateral aclexplode(coalesce(function.proacl, acldefault('f', function.proowner))) as privilege
    where function.oid = 'public.reconcile_profile(smallint,text,boolean,text)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no execute privilege'
);

select ok(
  not (select prosecdef from pg_proc where oid = 'public.reconcile_profile(smallint,text,boolean,text)'::regprocedure),
  'reconciliation uses security invoker'
);
select ok(
  exists (
    select 1
    from pg_proc as function
    cross join lateral unnest(function.proconfig) as setting
    where function.oid = 'public.reconcile_profile(smallint,text,boolean,text)'::regprocedure
      and setting in ('search_path=', 'search_path=""')
  ),
  'reconciliation has an empty search_path'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ),
  'id is the primary key'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_external_identity_key'
      and pg_get_constraintdef(oid) = 'UNIQUE (portal_installation_id, bitrix_user_id)'
  ),
  'portal installation and Bitrix user form the external identity'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_portal_installation_fk'
      and contype = 'f'
  ),
  'profile references a portal installation'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_role_check'
      and pg_get_constraintdef(oid) like '%editor%'
      and pg_get_constraintdef(oid) like '%administrator%'
  ),
  'role is limited to editor and administrator'
);

select col_default_is('public', 'profiles', 'role', 'editor', 'new profiles default to editor');
select col_default_is('public', 'profiles', 'is_active', 'true', 'new profiles default to active');
select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name in (
        'auth_user_id', 'email', 'phone', 'birthdate', 'address', 'photo',
        'access_token', 'refresh_token', 'permissions', 'raw_response'
      )
  ),
  'profiles contain no auth dependency, credentials, raw response, or unnecessary personal data'
);

select * from finish();
rollback;
