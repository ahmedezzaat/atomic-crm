-- One-time: companies with no deal, no subscription, not a customer and no sector yet become "Broker".
-- Companies that already have a sector are left alone.
update public.companies c
set sector = coalesce(
    (select s ->> 'value'
       from public.configuration cfg, jsonb_array_elements(cfg.config -> 'companySectors') s
      where lower(s ->> 'label') = 'broker'
      limit 1),
    'broker')
where coalesce(c.sector, '') = ''
  and not c.is_customer
  and not exists (select 1 from public.deals d where d.company_id = c.id)
  and not exists (select 1 from public.subscriptions s where s.company_id = c.id);
