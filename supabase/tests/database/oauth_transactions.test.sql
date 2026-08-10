begin;

select no_plan();

select has_table('public', 'oauth_transactions', 'oauth_transactions exists');
select col_type_is('public', 'oauth_transactions', 'id', 'uuid', 'id is UUID');
select col_type_is('public', 'oauth_transactions', 'state_hash', 'text', 'state_hash is text');
select col_type_is('public', 'oauth_transactions', 'return_path', 'text', 'return_path is text');
select col_type_is(
  'public',
  'oauth_transactions',
  'created_at',
  'timestamp with time zone',
  'created_at is timestamptz'
);
select col_type_is(
  'public',
  'oauth_transactions',
  'expires_at',
  'timestamp with time zone',
  'expires_at is timestamptz'
);
select col_type_is(
  'public',
  'oauth_transactions',
  'consumed_at',
  'timestamp with time zone',
  'consumed_at is timestamptz'
);
select col_not_null('public', 'oauth_transactions', 'id', 'id is required');
select col_not_null('public', 'oauth_transactions', 'state_hash', 'state_hash is required');
select col_not_null('public', 'oauth_transactions', 'return_path', 'return_path is required');
select col_not_null('public', 'oauth_transactions', 'created_at', 'created_at is required');
select col_not_null('public', 'oauth_transactions', 'expires_at', 'expires_at is required');
select col_is_null('public', 'oauth_transactions', 'consumed_at', 'consumed_at is nullable');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.oauth_transactions'::regclass),
  'RLS is enabled'
);
select is(
  (select count(*)::integer from pg_policy where polrelid = 'public.oauth_transactions'::regclass),
  0,
  'no RLS policies exist'
);

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'oauth_transactions'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'PUBLIC, anon, and authenticated have no table privileges'
);

select ok(has_table_privilege('service_role', 'public.oauth_transactions', 'select'), 'service_role can select');
select ok(has_table_privilege('service_role', 'public.oauth_transactions', 'insert'), 'service_role can insert');
select ok(has_table_privilege('service_role', 'public.oauth_transactions', 'update'), 'service_role can update');
select ok(not has_table_privilege('service_role', 'public.oauth_transactions', 'delete'), 'service_role cannot delete');
select ok(not has_table_privilege('service_role', 'public.oauth_transactions', 'truncate'), 'service_role cannot truncate');
select ok(not has_table_privilege('service_role', 'public.oauth_transactions', 'references'), 'service_role cannot add references');
select ok(not has_table_privilege('service_role', 'public.oauth_transactions', 'trigger'), 'service_role cannot add triggers');

select ok(
  not has_function_privilege('anon', 'public.consume_oauth_transaction(text)', 'execute'),
  'anon cannot execute consumption'
);
select ok(
  not has_function_privilege('authenticated', 'public.consume_oauth_transaction(text)', 'execute'),
  'authenticated cannot execute consumption'
);
select ok(
  has_function_privilege('service_role', 'public.consume_oauth_transaction(text)', 'execute'),
  'service_role can execute consumption'
);
select ok(
  not exists (
    select 1
    from pg_proc as function
    cross join lateral aclexplode(coalesce(function.proacl, acldefault('f', function.proowner))) as privilege
    where function.oid = 'public.consume_oauth_transaction(text)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no execute privilege'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.consume_oauth_transaction(text)'::regprocedure),
  'consumption uses security invoker'
);
select ok(
  exists (
    select 1
    from pg_proc as function
    cross join lateral unnest(function.proconfig) as setting
    where function.oid = 'public.consume_oauth_transaction(text)'::regprocedure
      and setting in ('search_path=', 'search_path=""')
  ),
  'consumption has an empty search_path'
);
select is(
  pg_get_function_result('public.consume_oauth_transaction(text)'::regprocedure),
  'TABLE(outcome oauth_transaction_consumption_outcome, return_path text)',
  'consumption has the expected result contract'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.oauth_transactions'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ),
  'id is the primary key'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.oauth_transactions'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (state_hash)'
  ),
  'state_hash is unique'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.oauth_transactions'::regclass
      and conname = 'oauth_transactions_state_hash_check'
  ),
  'state_hash format is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.oauth_transactions'::regclass
      and conname = 'oauth_transactions_return_path_check'
  ),
  'return_path is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.oauth_transactions'::regclass
      and conname = 'oauth_transactions_expiry_check'
  ),
  'expiry ordering is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.oauth_transactions'::regclass
      and conname = 'oauth_transactions_consumed_at_check'
  ),
  'consumption time ordering is constrained'
);

select * from finish();
rollback;
