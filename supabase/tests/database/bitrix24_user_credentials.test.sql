begin;

select no_plan();

select has_table('public', 'bitrix24_user_credentials', 'credentials table exists');
select col_type_is('public', 'bitrix24_user_credentials', 'id', 'uuid', 'id is UUID');
select col_type_is('public', 'bitrix24_user_credentials', 'portal_installation_id', 'smallint', 'portal ID is smallint');
select col_type_is('public', 'bitrix24_user_credentials', 'profile_id', 'uuid', 'profile ID is UUID');
select col_type_is('public', 'bitrix24_user_credentials', 'access_token_ciphertext', 'text', 'access ciphertext is text');
select col_type_is('public', 'bitrix24_user_credentials', 'access_token_iv', 'text', 'access IV is text');
select col_type_is('public', 'bitrix24_user_credentials', 'access_token_auth_tag', 'text', 'access tag is text');
select col_type_is('public', 'bitrix24_user_credentials', 'refresh_token_ciphertext', 'text', 'refresh ciphertext is text');
select col_type_is('public', 'bitrix24_user_credentials', 'refresh_token_iv', 'text', 'refresh IV is text');
select col_type_is('public', 'bitrix24_user_credentials', 'refresh_token_auth_tag', 'text', 'refresh tag is text');
select col_type_is('public', 'bitrix24_user_credentials', 'encryption_version', 'smallint', 'encryption version is smallint');
select col_type_is('public', 'bitrix24_user_credentials', 'token_version', 'bigint', 'token version is bigint');
select col_type_is('public', 'bitrix24_user_credentials', 'client_endpoint', 'text', 'client endpoint is text');
select col_type_is('public', 'bitrix24_user_credentials', 'access_token_expires_at', 'timestamp with time zone', 'expiry is timestamptz');
select col_type_is('public', 'bitrix24_user_credentials', 'status', 'text', 'status is text');
select col_type_is('public', 'bitrix24_user_credentials', 'reauth_required_at', 'timestamp with time zone', 'reauth timestamp is timestamptz');
select col_type_is('public', 'bitrix24_user_credentials', 'created_at', 'timestamp with time zone', 'created_at is timestamptz');
select col_type_is('public', 'bitrix24_user_credentials', 'updated_at', 'timestamp with time zone', 'updated_at is timestamptz');

select col_not_null('public', 'bitrix24_user_credentials', 'id', 'id is required');
select col_not_null('public', 'bitrix24_user_credentials', 'portal_installation_id', 'portal ID is required');
select col_not_null('public', 'bitrix24_user_credentials', 'profile_id', 'profile ID is required');
select col_not_null('public', 'bitrix24_user_credentials', 'access_token_ciphertext', 'access ciphertext is required');
select col_not_null('public', 'bitrix24_user_credentials', 'access_token_iv', 'access IV is required');
select col_not_null('public', 'bitrix24_user_credentials', 'access_token_auth_tag', 'access tag is required');
select col_not_null('public', 'bitrix24_user_credentials', 'refresh_token_ciphertext', 'refresh ciphertext is required');
select col_not_null('public', 'bitrix24_user_credentials', 'refresh_token_iv', 'refresh IV is required');
select col_not_null('public', 'bitrix24_user_credentials', 'refresh_token_auth_tag', 'refresh tag is required');
select col_not_null('public', 'bitrix24_user_credentials', 'encryption_version', 'encryption version is required');
select col_not_null('public', 'bitrix24_user_credentials', 'token_version', 'token version is required');
select col_not_null('public', 'bitrix24_user_credentials', 'client_endpoint', 'client endpoint is required');
select col_not_null('public', 'bitrix24_user_credentials', 'status', 'status is required');
select col_not_null('public', 'bitrix24_user_credentials', 'created_at', 'created_at is required');
select col_not_null('public', 'bitrix24_user_credentials', 'updated_at', 'updated_at is required');
select col_is_null('public', 'bitrix24_user_credentials', 'access_token_expires_at', 'expiry is nullable');
select col_is_null('public', 'bitrix24_user_credentials', 'reauth_required_at', 'reauth timestamp is nullable');
select col_has_default('public', 'bitrix24_user_credentials', 'id', 'id has a database default');
select col_has_default('public', 'bitrix24_user_credentials', 'created_at', 'created_at has a database default');
select col_has_default('public', 'bitrix24_user_credentials', 'updated_at', 'updated_at has a database default');

select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.bitrix24_user_credentials'::regclass
    and contype = 'p' and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
), 'id is the primary key');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.bitrix24_user_credentials'::regclass
    and conname = 'bitrix24_user_credentials_profile_portal_key'
    and pg_get_constraintdef(oid) = 'UNIQUE (profile_id, portal_installation_id)'
), 'one credential row exists per profile and portal');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.bitrix24_user_credentials'::regclass
    and conname = 'bitrix24_user_credentials_profile_portal_fk'
    and contype = 'f' and confdeltype = 'r'
    and pg_get_constraintdef(oid) like '%FOREIGN KEY (profile_id, portal_installation_id)%'
), 'composite profile FK prevents cross-portal credentials and restricts delete');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.bitrix24_user_credentials'::regclass
    and conname = 'bitrix24_user_credentials_portal_installation_fk'
    and contype = 'f' and confdeltype = 'r'
), 'portal FK restricts delete');
select has_index('public', 'bitrix24_user_credentials', 'bitrix24_user_credentials_portal_installation_idx', 'portal FK is indexed');

select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_status_check'), 'status is constrained');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_token_version_check'), 'token version is constrained');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_encryption_version_check'), 'encryption version is constrained');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_access_ciphertext_check'), 'access ciphertext is constrained');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_refresh_ciphertext_check'), 'refresh ciphertext is constrained');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_access_iv_check'), 'access IV is constrained');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_refresh_iv_check'), 'refresh IV is constrained');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_access_auth_tag_check'), 'access tag is constrained');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_refresh_auth_tag_check'), 'refresh tag is constrained');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_distinct_iv_check'), 'access and refresh IVs must differ');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_reauth_timestamp_check'), 'reauth timestamp matches status');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bitrix24_user_credentials'::regclass and conname = 'bitrix24_user_credentials_timestamps_check'), 'timestamps are constrained');

select ok((select relrowsecurity from pg_class where oid = 'public.bitrix24_user_credentials'::regclass), 'RLS is enabled');
select is((select count(*)::integer from pg_policy where polrelid = 'public.bitrix24_user_credentials'::regclass), 0, 'no RLS policies exist');
select ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'bitrix24_user_credentials'
    and grantee in ('PUBLIC', 'anon', 'authenticated')
), 'PUBLIC, anon, and authenticated have no table privileges');
select ok(has_table_privilege('service_role', 'public.bitrix24_user_credentials', 'select'), 'service_role can select');
select ok(has_table_privilege('service_role', 'public.bitrix24_user_credentials', 'insert'), 'service_role can insert');
select ok(has_table_privilege('service_role', 'public.bitrix24_user_credentials', 'update'), 'service_role can update');
select ok(not has_table_privilege('service_role', 'public.bitrix24_user_credentials', 'delete'), 'service_role cannot delete');
select ok(not has_table_privilege('service_role', 'public.bitrix24_user_credentials', 'truncate'), 'service_role cannot truncate');
select ok(not has_table_privilege('service_role', 'public.bitrix24_user_credentials', 'references'), 'service_role cannot add references');
select ok(not has_table_privilege('service_role', 'public.bitrix24_user_credentials', 'trigger'), 'service_role cannot add triggers');

select has_function('public', 'create_bitrix24_user_credentials', array['smallint','uuid','text','text','text','text','text','text','smallint','text','timestamp with time zone'], 'create RPC signature exists');
select has_function('public', 'resolve_bitrix24_user_credentials', array['smallint','uuid'], 'resolve RPC signature exists');
select has_function('public', 'rotate_bitrix24_user_credentials', array['smallint','uuid','bigint','text','text','text','text','text','text','smallint','text','timestamp with time zone'], 'rotate RPC signature exists');
select has_function('public', 'mark_bitrix24_credentials_reauth_required', array['smallint','uuid','bigint'], 'reauth RPC signature exists');

select is(
  pg_get_function_result('public.create_bitrix24_user_credentials(smallint,uuid,text,text,text,text,text,text,smallint,text,timestamptz)'::regprocedure),
  'TABLE(outcome bitrix24_credential_creation_outcome, credential_id uuid, portal_installation_id smallint, profile_id uuid, access_token_ciphertext text, access_token_iv text, access_token_auth_tag text, refresh_token_ciphertext text, refresh_token_iv text, refresh_token_auth_tag text, encryption_version smallint, token_version bigint, client_endpoint text, access_token_expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)',
  'create RPC has the expected result contract'
);
select is(
  pg_get_function_result('public.resolve_bitrix24_user_credentials(smallint,uuid)'::regprocedure),
  'TABLE(outcome bitrix24_credential_resolution_outcome, credential_id uuid, portal_installation_id smallint, profile_id uuid, access_token_ciphertext text, access_token_iv text, access_token_auth_tag text, refresh_token_ciphertext text, refresh_token_iv text, refresh_token_auth_tag text, encryption_version smallint, token_version bigint, client_endpoint text, access_token_expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)',
  'resolve RPC has the expected result contract'
);
select is(
  pg_get_function_result('public.rotate_bitrix24_user_credentials(smallint,uuid,bigint,text,text,text,text,text,text,smallint,text,timestamptz)'::regprocedure),
  'TABLE(outcome bitrix24_credential_rotation_outcome, token_version bigint)',
  'rotate RPC has the expected result contract'
);
select is(
  pg_get_function_result('public.mark_bitrix24_credentials_reauth_required(smallint,uuid,bigint)'::regprocedure),
  'TABLE(outcome bitrix24_credential_reauth_outcome)',
  'reauth RPC has the expected result contract'
);

select ok(not exists (
  select 1 from unnest(array[
    'public.create_bitrix24_user_credentials(smallint,uuid,text,text,text,text,text,text,smallint,text,timestamptz)'::regprocedure,
    'public.resolve_bitrix24_user_credentials(smallint,uuid)'::regprocedure,
    'public.rotate_bitrix24_user_credentials(smallint,uuid,bigint,text,text,text,text,text,text,smallint,text,timestamptz)'::regprocedure,
    'public.mark_bitrix24_credentials_reauth_required(smallint,uuid,bigint)'::regprocedure
  ]) as rpc(oid)
  where (select prosecdef from pg_proc where pg_proc.oid = rpc.oid)
), 'all credential RPCs use security invoker');
select ok(not exists (
  select 1 from unnest(array[
    'public.create_bitrix24_user_credentials(smallint,uuid,text,text,text,text,text,text,smallint,text,timestamptz)'::regprocedure,
    'public.resolve_bitrix24_user_credentials(smallint,uuid)'::regprocedure,
    'public.rotate_bitrix24_user_credentials(smallint,uuid,bigint,text,text,text,text,text,text,smallint,text,timestamptz)'::regprocedure,
    'public.mark_bitrix24_credentials_reauth_required(smallint,uuid,bigint)'::regprocedure
  ]) as rpc(oid)
  where not exists (
    select 1 from pg_proc as function
    cross join lateral unnest(function.proconfig) as setting
    where function.oid = rpc.oid and setting in ('search_path=', 'search_path=""')
  )
), 'all credential RPCs have an empty search_path');

select ok(not exists (
  select 1 from pg_proc as function
  cross join lateral aclexplode(coalesce(function.proacl, acldefault('f', function.proowner))) as privilege
  where function.oid = any(array[
    'public.create_bitrix24_user_credentials(smallint,uuid,text,text,text,text,text,text,smallint,text,timestamptz)'::regprocedure,
    'public.resolve_bitrix24_user_credentials(smallint,uuid)'::regprocedure,
    'public.rotate_bitrix24_user_credentials(smallint,uuid,bigint,text,text,text,text,text,text,smallint,text,timestamptz)'::regprocedure,
    'public.mark_bitrix24_credentials_reauth_required(smallint,uuid,bigint)'::regprocedure
  ]) and privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
), 'PUBLIC has no execute privilege on credential RPCs');
select ok(
  not has_function_privilege('anon', 'public.create_bitrix24_user_credentials(smallint,uuid,text,text,text,text,text,text,smallint,text,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.resolve_bitrix24_user_credentials(smallint,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.rotate_bitrix24_user_credentials(smallint,uuid,bigint,text,text,text,text,text,text,smallint,text,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.mark_bitrix24_credentials_reauth_required(smallint,uuid,bigint)', 'execute'),
  'anon cannot execute credential RPCs'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_bitrix24_user_credentials(smallint,uuid,text,text,text,text,text,text,smallint,text,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.resolve_bitrix24_user_credentials(smallint,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.rotate_bitrix24_user_credentials(smallint,uuid,bigint,text,text,text,text,text,text,smallint,text,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.mark_bitrix24_credentials_reauth_required(smallint,uuid,bigint)', 'execute'),
  'authenticated cannot execute credential RPCs'
);
select ok(
  has_function_privilege('service_role', 'public.create_bitrix24_user_credentials(smallint,uuid,text,text,text,text,text,text,smallint,text,timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.resolve_bitrix24_user_credentials(smallint,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.rotate_bitrix24_user_credentials(smallint,uuid,bigint,text,text,text,text,text,text,smallint,text,timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.mark_bitrix24_credentials_reauth_required(smallint,uuid,bigint)', 'execute'),
  'service_role can execute all credential RPCs'
);
select is(
  (
    select count(*)::integer
    from pg_proc as function
    join pg_namespace as namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname in (
        'create_bitrix24_user_credentials',
        'resolve_bitrix24_user_credentials',
        'rotate_bitrix24_user_credentials',
        'mark_bitrix24_credentials_reauth_required'
      )
      and has_function_privilege('service_role', function.oid, 'execute')
  ),
  4,
  'service_role executes exactly the four credential RPCs'
);

select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'bitrix24_user_credentials'
    and column_name in ('access_token', 'refresh_token', 'encryption_key', 'client_secret', 'bitrix_user_id', 'email', 'role', 'oauth_response', 'provider_error')
), 'credentials contain no plaintext token, key, duplicated identity, or raw provider fields');

select * from finish();
rollback;
