-- Provider credentials (SMS API token/key). RLS is on with no policies, so the
-- app's own users can never read them; only the server functions can.
create table public.integration_secrets (
    key text primary key,
    value text not null,
    updated_at timestamp with time zone not null default now()
);

alter table public.integration_secrets enable row level security;

revoke all on table public.integration_secrets from anon;
revoke all on table public.integration_secrets from authenticated;
grant all on table public.integration_secrets to service_role;
