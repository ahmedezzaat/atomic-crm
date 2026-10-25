alter table public.companies add column is_customer boolean not null default false;

create or replace view public.customers_summary with (security_invoker = on) as
select
    c.id,
    c.name,
    c.logo,
    c.city,
    c.phone_number,
    c.sector,
    (select count(*) from public.deals d where d.company_id = c.id and d.stage = 'won' and d.archived_at is null) as nb_won_deals,
    (select count(*) from public.subscriptions s where s.company_id = c.id) as nb_subscriptions,
    (select count(*) from public.subscriptions s where s.company_id = c.id and s.end_date >= current_date) as nb_active_subscriptions,
    coalesce((select sum(s.value) from public.subscriptions s where s.company_id = c.id and s.end_date >= current_date), 0) as active_value,
    coalesce((select sum(s.nb_users) from public.subscriptions s where s.company_id = c.id and s.end_date >= current_date), 0) as active_users,
    (select min(s.end_date) from public.subscriptions s where s.company_id = c.id and s.end_date >= current_date) as next_end_date,
    c.is_customer
from public.companies c
where c.is_customer or exists (
    select 1 from public.deals d where d.company_id = c.id and d.stage = 'won' and d.archived_at is null
);
