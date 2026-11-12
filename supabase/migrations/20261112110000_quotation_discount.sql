alter table public.quotations
    add column discount_type text not null default 'amount',
    add column discount_value numeric not null default 0,
    add constraint quotations_discount_type_check check (discount_type in ('amount', 'percent')),
    add constraint quotations_discount_value_check check (discount_value >= 0);
