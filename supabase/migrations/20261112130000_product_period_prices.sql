-- Each product has a monthly, quarterly and bi-annual price
alter table public.products rename column unit_price to price_monthly;
alter table public.products
    add column price_quarterly numeric not null default 0,
    add column price_biannual numeric not null default 0;
update public.products set price_quarterly = price_monthly * 3, price_biannual = price_monthly * 6;
