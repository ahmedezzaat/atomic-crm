--
-- Views
-- This file declares all views in the public schema.
--

create or replace view public.activity_log with (security_invoker = on) as
select
    ('company.' || c.id || '.created') as id,
    'company.created' as type,
    c.created_at as date,
    c.id as company_id,
    c.sales_id,
    (to_jsonb(c.*) - 'fts')::json as company,
    null::json as contact,
    null::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.companies c
union all
select
    ('contact.' || co.id || '.created') as id,
    'contact.created' as type,
    co.first_seen as date,
    co.company_id,
    co.sales_id,
    null::json as company,
    (to_jsonb(co.*) - 'fts')::json as contact,
    null::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.contacts co
union all
select
    ('contactNote.' || cn.id || '.created') as id,
    'contactNote.created' as type,
    cn.date,
    co.company_id,
    cn.sales_id,
    null::json as company,
    null::json as contact,
    null::json as deal,
    (to_jsonb(cn.*) - 'fts')::json as contact_note,
    null::json as deal_note
from public.contact_notes cn
    left join public.contacts co on co.id = cn.contact_id
union all
select
    ('deal.' || d.id || '.created') as id,
    'deal.created' as type,
    d.created_at as date,
    d.company_id,
    d.sales_id,
    null::json as company,
    null::json as contact,
    (to_jsonb(d.*) - 'fts')::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.deals d
union all
select
    ('dealNote.' || dn.id || '.created') as id,
    'dealNote.created' as type,
    dn.date,
    d.company_id,
    dn.sales_id,
    null::json as company,
    null::json as contact,
    null::json as deal,
    null::json as contact_note,
    (to_jsonb(dn.*) - 'fts')::json as deal_note
from public.deal_notes dn
    left join public.deals d on d.id = dn.deal_id;

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

create or replace view public.contacts_summary with (security_invoker = on) as
select
    co.id,
    co.first_name,
    co.last_name,
    co.gender,
    co.title,
    co.background,
    co.avatar,
    co.first_seen,
    co.last_seen,
    co.has_newsletter,
    co.status,
    co.tags,
    co.company_id,
    co.sales_id,
    co.linkedin_url,
    co.email_jsonb,
    co.phone_jsonb,
    (jsonb_path_query_array(co.email_jsonb, '$[*]."email"'))::text as email_fts,
    (jsonb_path_query_array(co.phone_jsonb, '$[*]."number"'))::text as phone_fts,
    c.name as company_name,
    count(distinct t.id) filter (where t.done_date is null) as nb_tasks
from public.contacts co
    left join public.tasks t on co.id = t.contact_id
    left join public.companies c on co.company_id = c.id
group by co.id, c.name;

create or replace view public.init_state with (security_invoker = off) as
select count(sub.id) as is_initialized
from (
    select sales.id from public.sales limit 1
) sub;

-- Customers are the companies that have at least one won (non-archived) deal.
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

-- Campaign progress, derived from the per-recipient messages.
create or replace view public.sms_campaigns_summary with (security_invoker = on) as
select
    c.*,
    count(m.id) as nb_messages,
    count(m.id) filter (where m.status in ('sent', 'delivered')) as nb_sent,
    count(m.id) filter (where m.status = 'delivered') as nb_delivered,
    count(m.id) filter (where m.status in ('undelivered', 'failed')) as nb_failed
from public.sms_campaigns c
    left join public.sms_messages m on m.campaign_id = c.id
group by c.id;
