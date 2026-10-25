alter table public.companies add column competitor text;

alter table public.tasks alter column contact_id drop not null;
alter table public.tasks add column company_id bigint;

alter table public.tasks
    add constraint tasks_company_id_fkey foreign key (company_id) references public.companies(id) on update cascade on delete cascade;

alter table public.tasks
    add constraint tasks_target_check check (contact_id is not null or company_id is not null);

create or replace view public.companies_summary with (security_invoker = on) as
select
    c.id,
    c.created_at,
    c.name,
    c.sector,
    c.size,
    c.linkedin_url,
    c.website,
    c.phone_number,
    c.address,
    c.zipcode,
    c.city,
    c.state_abbr,
    c.sales_id,
    c.context_links,
    c.country,
    c.description,
    c.revenue,
    c.tax_identifier,
    c.logo,
    count(distinct d.id) as nb_deals,
    count(distinct co.id) as nb_contacts,
    c.competitor
from public.companies c
    left join public.deals d on c.id = d.company_id
    left join public.contacts co on c.id = co.company_id
group by c.id;
