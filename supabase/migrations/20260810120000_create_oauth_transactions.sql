create type public.oauth_transaction_consumption_outcome as enum (
  'consumed',
  'unknown',
  'expired',
  'already_consumed'
);

create table public.oauth_transactions (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  return_path text not null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '10 minutes'),
  consumed_at timestamptz,
  constraint oauth_transactions_state_hash_check check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint oauth_transactions_return_path_check check (
    char_length(return_path) between 1 and 2048
    and (return_path = '/' or return_path ~ '^/[^/]')
    and return_path !~ E'\\\\'
    and return_path !~ '[[:cntrl:]]'
    and return_path !~* '%(?:0[0-9a-f]|1[0-9a-f]|25|7f|2f|5c)'
  ),
  constraint oauth_transactions_expiry_check check (expires_at > created_at),
  constraint oauth_transactions_consumed_at_check check (
    consumed_at is null or consumed_at >= created_at
  )
);

alter table public.oauth_transactions enable row level security;

revoke all on table public.oauth_transactions from public, anon, authenticated, service_role;
grant select, insert, update on table public.oauth_transactions to service_role;

create function public.consume_oauth_transaction(p_state_hash text)
returns table (
  outcome public.oauth_transaction_consumption_outcome,
  return_path text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction public.oauth_transactions%rowtype;
  v_consumed_at timestamptz;
begin
  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid OAuth state hash';
  end if;

  select transaction.*
  into v_transaction
  from public.oauth_transactions as transaction
  where transaction.state_hash = p_state_hash
  for update;

  if not found then
    return query
    select 'unknown'::public.oauth_transaction_consumption_outcome, null::text;
    return;
  end if;

  if v_transaction.consumed_at is not null then
    return query
    select 'already_consumed'::public.oauth_transaction_consumption_outcome, null::text;
    return;
  end if;

  v_consumed_at := clock_timestamp();
  if v_transaction.expires_at <= v_consumed_at then
    return query
    select 'expired'::public.oauth_transaction_consumption_outcome, null::text;
    return;
  end if;

  update public.oauth_transactions as transaction
  set consumed_at = v_consumed_at
  where transaction.id = v_transaction.id;

  return query
  select
    'consumed'::public.oauth_transaction_consumption_outcome,
    v_transaction.return_path;
end;
$$;

revoke all on function public.consume_oauth_transaction(text)
  from public, anon, authenticated;
grant execute on function public.consume_oauth_transaction(text) to service_role;
