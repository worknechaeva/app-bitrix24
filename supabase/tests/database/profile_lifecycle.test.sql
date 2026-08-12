begin;

select plan(17);

select has_column(
  'public',
  'portal_installations',
  'admin_bootstrapped_at',
  'portal installation records completion of first administrator bootstrap'
);

select col_type_is(
  'public',
  'portal_installations',
  'admin_bootstrapped_at',
  'timestamp with time zone',
  'bootstrap completion uses database time'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.bootstrap_first_administrator(smallint,uuid,text)',
    'execute'
  ),
  'service_role can execute first administrator bootstrap'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.bootstrap_first_administrator(smallint,uuid,text)',
    'execute'
  ) and not has_function_privilege(
    'authenticated',
    'public.bootstrap_first_administrator(smallint,uuid,text)',
    'execute'
  ),
  'browser roles cannot execute first administrator bootstrap'
);
select ok(
  not exists (
    select 1
    from pg_proc as function
    cross join lateral aclexplode(coalesce(function.proacl, acldefault('f', function.proowner))) as privilege
    where function.oid = 'public.bootstrap_first_administrator(smallint,uuid,text)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute first administrator bootstrap'
);
select ok(
  not (select prosecdef from pg_proc
    where oid = 'public.bootstrap_first_administrator(smallint,uuid,text)'::regprocedure),
  'first administrator bootstrap uses security invoker'
);
select ok(
  exists (
    select 1
    from pg_proc as function
    cross join lateral unnest(function.proconfig) as setting
    where function.oid = 'public.bootstrap_first_administrator(smallint,uuid,text)'::regprocedure
      and setting in ('search_path=', 'search_path=""')
  ),
  'first administrator bootstrap has an empty search_path'
);

select ok(
  has_function_privilege('service_role', 'public.change_profile_role(text,uuid,text)', 'execute'),
  'service_role can execute role changes'
);
select ok(
  not has_function_privilege('anon', 'public.change_profile_role(text,uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.change_profile_role(text,uuid,text)', 'execute'),
  'browser roles cannot execute role changes'
);
select ok(
  not exists (
    select 1
    from pg_proc as function
    cross join lateral aclexplode(coalesce(function.proacl, acldefault('f', function.proowner))) as privilege
    where function.oid = 'public.change_profile_role(text,uuid,text)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute role changes'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.change_profile_role(text,uuid,text)'::regprocedure),
  'role changes use security invoker'
);
select ok(
  exists (
    select 1
    from pg_proc as function
    cross join lateral unnest(function.proconfig) as setting
    where function.oid = 'public.change_profile_role(text,uuid,text)'::regprocedure
      and setting in ('search_path=', 'search_path=""')
  ),
  'role changes have an empty search_path'
);

select ok(
  has_function_privilege('service_role', 'public.block_profile(text,uuid)', 'execute'),
  'service_role can execute profile block'
);
select ok(
  not has_function_privilege('anon', 'public.block_profile(text,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.block_profile(text,uuid)', 'execute'),
  'browser roles cannot execute profile block'
);
select ok(
  not exists (
    select 1
    from pg_proc as function
    cross join lateral aclexplode(coalesce(function.proacl, acldefault('f', function.proowner))) as privilege
    where function.oid = 'public.block_profile(text,uuid)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute profile block'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.block_profile(text,uuid)'::regprocedure),
  'profile block uses security invoker'
);
select ok(
  exists (
    select 1
    from pg_proc as function
    cross join lateral unnest(function.proconfig) as setting
    where function.oid = 'public.block_profile(text,uuid)'::regprocedure
      and setting in ('search_path=', 'search_path=""')
  ),
  'profile block has an empty search_path'
);

select * from finish();
rollback;
