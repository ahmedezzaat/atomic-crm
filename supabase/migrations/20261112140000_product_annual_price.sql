alter table public.products add column price_annual numeric not null default 0;
update public.products set price_annual = price_monthly * 12;
