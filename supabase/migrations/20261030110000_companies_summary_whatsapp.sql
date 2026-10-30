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
    c.competitor,
    c.lead_source,
    c.tags,
    c.whatsapp_opt_in,
    c.whatsapp_opted_out
from public.companies c
    left join public.deals d on c.id = d.company_id
    left join public.contacts co on c.id = co.company_id
group by c.id;
