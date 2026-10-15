-- Ejecutar una vez en el SQL Editor de Supabase. No modifica tablas del .exe.
create table public.mw_accounts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 kick_id text not null, name text not null, credentials text not null,
 lease_id uuid, lease_until timestamptz, last_send_at timestamptz,
 unique(owner_id,kick_id)
);
create table public.mw_oauth (
 state_hash text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 binding_hash text not null, verifier text not null, expires_at timestamptz not null
);
create table public.mw_receipts (
 owner_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
 status text not null check(status in ('pending','sent','failed','unknown')),
 created_at timestamptz not null default now(), primary key(owner_id,request_id)
);
alter table public.mw_accounts enable row level security;
alter table public.mw_oauth enable row level security;
alter table public.mw_receipts enable row level security;
revoke all on public.mw_accounts,public.mw_oauth,public.mw_receipts from anon,authenticated;
grant all on public.mw_accounts,public.mw_oauth,public.mw_receipts to service_role;
-- Solo el backend puede acceder a estas tablas. Nunca enviar la service-role al cliente.
create or replace function public.mw_acquire(p_owner uuid,p_account uuid,p_lease uuid)
returns setof public.mw_accounts language sql security invoker set search_path=public as $$
 update public.mw_accounts set lease_id=p_lease,lease_until=now()+interval '120 seconds',last_send_at=now()
 where owner_id=p_owner and id=p_account and (lease_until is null or lease_until<now())
 and (last_send_at is null or last_send_at<now()-interval '3 seconds') returning *;
$$;
revoke all on function public.mw_acquire(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.mw_acquire(uuid,uuid,uuid) to service_role;
