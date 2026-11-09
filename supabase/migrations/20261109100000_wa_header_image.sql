-- Templates with an image header need the image sent with every message.
-- header_image_url: public https link to the image (jpg/png). Follow-ups keep theirs in the followups list.
alter table public.wa_campaigns
    add column header_image_url text not null default '';

-- c.* is expanded when a view is created, so recreate it to pick up the new column
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
