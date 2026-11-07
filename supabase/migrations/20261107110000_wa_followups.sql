-- WhatsApp campaign follow-ups: up to two extra templates sent to people who
-- did not reply to the campaign message within a number of hours.
-- followups is a list of {after_hours, template_name, template_language, with_name}.
alter table public.wa_campaigns
    add column followups jsonb not null default '[]'::jsonb,
    add constraint wa_campaigns_followups_check
        check (jsonb_typeof(followups) = 'array' and jsonb_array_length(followups) <= 2);

-- 0 for the campaign message, 1 and 2 for its follow-ups
alter table public.whatsapp_messages
    add column followup_step smallint not null default 0;
create index whatsapp_messages_campaign_step_idx on public.whatsapp_messages (campaign_id, followup_step)
    where campaign_id is not null;

-- c.* is expanded when a view is created, so recreate it to pick up the new column.
-- Sent/delivered/read/replied count the campaign message only; follow-ups have their own counts.
drop view public.wa_campaigns_summary;
create view public.wa_campaigns_summary with (security_invoker = on) as
select
    c.*,
    count(m.id) filter (where m.followup_step = 0) as nb_messages,
    count(m.id) filter (where m.followup_step = 0 and m.status in ('sent', 'delivered', 'read')) as nb_sent,
    count(m.id) filter (where m.followup_step = 0 and m.status in ('delivered', 'read')) as nb_delivered,
    count(m.id) filter (where m.followup_step = 0 and m.status = 'read') as nb_read,
    count(m.id) filter (where m.status = 'failed') as nb_failed,
    count(distinct m.phone) filter (where m.followup_step = 0 and exists (
        select 1 from public.whatsapp_messages r
        where r.phone = m.phone and r.direction = 'in' and r.created_at > m.created_at
    )) as nb_replied,
    count(m.id) filter (where m.followup_step > 0 and m.status in ('sent', 'delivered', 'read')) as nb_followups,
    count(distinct m.phone) filter (where m.followup_step > 0 and exists (
        select 1 from public.whatsapp_messages r
        where r.phone = m.phone and r.direction = 'in' and r.created_at > m.created_at
    )) as nb_replied_after_followup
from public.wa_campaigns c
    left join public.whatsapp_messages m on m.campaign_id = c.id and m.direction = 'out'
group by c.id;
grant all on table public.wa_campaigns_summary to authenticated;
grant all on table public.wa_campaigns_summary to service_role;
