-- WhatsApp campaigns send only inside a daily window (Cairo time), e.g. 11:00 to 20:00.
-- Automatic campaigns spread their daily batch over the hours of the window.
alter table public.wa_campaigns
    add column send_from_hour smallint not null default 11,
    add column send_to_hour smallint not null default 20;

-- keep existing automatic campaigns sending at the hour they were set to
update public.wa_campaigns
    set send_from_hour = send_hour, send_to_hour = send_hour + 1;

alter table public.wa_campaigns
    add constraint wa_campaigns_send_window_check
        check (send_from_hour between 0 and 23 and send_to_hour between 1 and 24 and send_from_hour < send_to_hour);

-- c.* is expanded when a view is created, so drop it before the column and recreate it
drop view public.wa_campaigns_summary;
alter table public.wa_campaigns drop column send_hour;
create view public.wa_campaigns_summary with (security_invoker = on) as
select
    c.*,
    count(m.id) as nb_messages,
    count(m.id) filter (where m.status in ('sent', 'delivered', 'read')) as nb_sent,
    count(m.id) filter (where m.status in ('delivered', 'read')) as nb_delivered,
    count(m.id) filter (where m.status = 'read') as nb_read,
    count(m.id) filter (where m.status = 'failed') as nb_failed,
    count(distinct m.phone) filter (where exists (
        select 1 from public.whatsapp_messages r
        where r.phone = m.phone and r.direction = 'in' and r.created_at > m.created_at
    )) as nb_replied
from public.wa_campaigns c
    left join public.whatsapp_messages m on m.campaign_id = c.id and m.direction = 'out'
group by c.id;
grant all on table public.wa_campaigns_summary to authenticated;
grant all on table public.wa_campaigns_summary to service_role;

-- Called every hour by pg_cron: asks wa_campaign_send for a share of the daily
-- batch of every automatic campaign whose window (Cairo time) includes this hour.
create or replace function public.run_wa_auto_campaigns() returns void
    language plpgsql security definer set search_path = ''
as $$
declare
    base_url text;
    token text;
    campaign record;
    cairo_hour int := extract(hour from (now() at time zone 'Africa/Cairo'))::int;
begin
    select value into base_url from public.integration_secrets where key = 'functions_url';
    select value into token from public.integration_secrets where key = 'cron_token';
    if base_url is null or token is null then
        return;
    end if;
    for campaign in
        select id from public.wa_campaigns
        where auto_daily
          and status <> 'done'
          and template_name <> ''
          and cairo_hour >= send_from_hour
          and cairo_hour < send_to_hour
    loop
        perform net.http_post(
            url := base_url || '/wa_campaign_send',
            body := jsonb_build_object('campaign_id', campaign.id, 'cron', true),
            headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', token),
            timeout_milliseconds := 5000
        );
    end loop;
end;
$$;
revoke all on function public.run_wa_auto_campaigns() from public, anon, authenticated;
