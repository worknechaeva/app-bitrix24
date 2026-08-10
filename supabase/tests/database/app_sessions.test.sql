begin;

select no_plan();

select has_table('public', 'app_sessions', 'app_sessions exists');
select col_type_is('public', 'app_sessions', 'id', 'uuid', 'id is UUID');
select col_type_is('public', 'app_sessions', 'portal_installation_id', 'smallint', 'portal ID is smallint');
select col_type_is('public', 'app_sessions', 'profile_id', 'uuid', 'profile ID is UUID');
select col_type_is('public', 'app_sessions', 'token_hash', 'text', 'token hash is text');
select col_type_is('public', 'app_sessions', 'created_at', 'timestamp with time zone', 'created_at is timestamptz');
select col_type_is('public', 'app_sessions', 'expires_at', 'timestamp with time zone', 'expires_at is timestamptz');
select col_type_is('public', 'app_sessions', 'revoked_at', 'timestamp with time zone', 'revoked_at is timestamptz');

select col_not_null('public', 'app_sessions', 'id', 'id is required');
select col_not_null('public', 'app_sessions', 'portal_installation_id', 'portal ID is required');
select col_not_null('public', 'app_sessions', 'profile_id', 'profile ID is required');
select col_not_null('public', 'app_sessions', 'token_hash', 'token hash is required');
select col_not_null('public', 'app_sessions', 'created_at', 'created_at is required');
select col_not_null('public', 'app_sessions', 'expires_at', 'expires_at is required');
select col_is_null('public', 'app_sessions', 'revoked_at', 'revoked_at is nullable');

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ),
  'id is the primary key'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (token_hash)'
  ),
  'token hash is unique'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and conname = 'app_sessions_token_hash_check'
      and pg_get_constraintdef(oid) like '%[0-9a-f]{64}%'
  ),
  'token hash format is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and conname = 'app_sessions_exact_expiry_check'
      and pg_get_constraintdef(oid) like '%30 days%'
  ),
  'exact 30-day expiry is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and conname = 'app_sessions_revoked_at_check'
  ),
  'revocation timestamp is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and conname = 'app_sessions_portal_installation_fk'
      and contype = 'f'
      and confdeltype = 'r'
  ),
  'session references portal with delete restricted'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and conname = 'app_sessions_profile_portal_fk'
      and contype = 'f'
      and confdeltype = 'r'
      and pg_get_constraintdef(oid) like '%FOREIGN KEY (profile_id, portal_installation_id)%'
  ),
  'composite profile foreign key prevents cross-portal sessions'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_id_portal_installation_key'
      and pg_get_constraintdef(oid) = 'UNIQUE (id, portal_installation_id)'
  ),
  'profiles expose the matching composite key'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.app_sessions'::regclass),
  'RLS is enabled'
);
select is(
  (select count(*)::integer from pg_policy where polrelid = 'public.app_sessions'::regclass),
  0,
  'no RLS policies exist'
);
select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'app_sessions'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'PUBLIC, anon, and authenticated have no table privileges'
);

select ok(has_table_privilege('service_role', 'public.app_sessions', 'select'), 'service_role can select');
select ok(has_table_privilege('service_role', 'public.app_sessions', 'insert'), 'service_role can insert');
select ok(has_table_privilege('service_role', 'public.app_sessions', 'update'), 'service_role can update');
select ok(not has_table_privilege('service_role', 'public.app_sessions', 'delete'), 'service_role cannot delete');
select ok(not has_table_privilege('service_role', 'public.app_sessions', 'truncate'), 'service_role cannot truncate');
select ok(not has_table_privilege('service_role', 'public.app_sessions', 'references'), 'service_role cannot add references');
select ok(not has_table_privilege('service_role', 'public.app_sessions', 'trigger'), 'service_role cannot add triggers');

select has_function('public', 'create_app_session', array['smallint', 'uuid', 'text'], 'create RPC signature exists');
select has_function('public', 'resolve_app_session', array['text'], 'resolve RPC signature exists');
select has_function('public', 'revoke_app_session', array['text'], 'revoke RPC signature exists');

select is(
  pg_get_function_result('public.create_app_session(smallint,uuid,text)'::regprocedure),
  'TABLE(outcome app_session_creation_outcome, session_id uuid, profile_id uuid, portal_installation_id smallint, created_at timestamp with time zone, expires_at timestamp with time zone)',
  'create has the expected result contract'
);
select is(
  pg_get_function_result('public.resolve_app_session(text)'::regprocedure),
  'TABLE(outcome app_session_resolution_outcome, session_id uuid, profile_id uuid, portal_installation_id smallint, role text, expires_at timestamp with time zone)',
  'resolve has the expected result contract'
);
select is(
  pg_get_function_result('public.revoke_app_session(text)'::regprocedure),
  'TABLE(outcome app_session_revocation_outcome)',
  'revoke has the expected result contract'
);

select ok(
  not (select prosecdef from pg_proc where oid = 'public.create_app_session(smallint,uuid,text)'::regprocedure),
  'create uses security invoker'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.resolve_app_session(text)'::regprocedure),
  'resolve uses security invoker'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.revoke_app_session(text)'::regprocedure),
  'revoke uses security invoker'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.create_app_session(smallint,uuid,text)'::regprocedure,
      'public.resolve_app_session(text)'::regprocedure,
      'public.revoke_app_session(text)'::regprocedure
    ]) as rpc(oid)
    where not exists (
      select 1
      from pg_proc as function
      cross join lateral unnest(function.proconfig) as setting
      where function.oid = rpc.oid
        and setting in ('search_path=', 'search_path=""')
    )
  ),
  'all session RPCs have an empty search_path'
);

select ok(
  not exists (
    select 1
    from pg_proc as function
    cross join lateral aclexplode(coalesce(function.proacl, acldefault('f', function.proowner))) as privilege
    where function.oid = any(array[
        'public.create_app_session(smallint,uuid,text)'::regprocedure,
        'public.resolve_app_session(text)'::regprocedure,
        'public.revoke_app_session(text)'::regprocedure
      ])
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no execute privilege on session RPCs'
);
select ok(
  not has_function_privilege('anon', 'public.create_app_session(smallint,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.resolve_app_session(text)', 'execute')
  and not has_function_privilege('anon', 'public.revoke_app_session(text)', 'execute'),
  'anon cannot execute session RPCs'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_app_session(smallint,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.resolve_app_session(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.revoke_app_session(text)', 'execute'),
  'authenticated cannot execute session RPCs'
);
select ok(
  has_function_privilege('service_role', 'public.create_app_session(smallint,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.resolve_app_session(text)', 'execute')
  and has_function_privilege('service_role', 'public.revoke_app_session(text)', 'execute'),
  'service_role can execute all session RPCs'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_sessions'
      and column_name in (
        'raw_token', 'token', 'role', 'bitrix_user_id', 'access_token', 'refresh_token',
        'ip_address', 'user_agent', 'device_fingerprint', 'browser_metadata', 'last_seen_at'
      )
  ),
  'sessions contain no raw token, identity snapshot, credentials, or browser tracking metadata'
);

select * from finish();
rollback;
