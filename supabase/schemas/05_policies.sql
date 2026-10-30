--
-- Row Level Security
-- This file declares RLS policies for all tables.
--

-- Enable RLS on all tables
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.deals enable row level security;
alter table public.deal_notes enable row level security;
alter table public.sales enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.configuration enable row level security;
alter table public.favicons_excluded_domains enable row level security;

-- Companies
create policy "Enable read access for authenticated users" on public.companies for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.companies for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.companies for update to authenticated using (true) with check (true);
create policy "Company Delete Policy" on public.companies for delete to authenticated using (true);

-- Contacts
create policy "Enable read access for authenticated users" on public.contacts for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.contacts for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.contacts for update to authenticated using (true) with check (true);
create policy "Contact Delete Policy" on public.contacts for delete to authenticated using (true);

-- Contact Notes
create policy "Enable read access for authenticated users" on public.contact_notes for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.contact_notes for insert to authenticated with check (true);
create policy "Contact Notes Update policy" on public.contact_notes for update to authenticated using (true);
create policy "Contact Notes Delete Policy" on public.contact_notes for delete to authenticated using (true);

-- Deals
create policy "Enable read access for authenticated users" on public.deals for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.deals for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.deals for update to authenticated using (true) with check (true);
create policy "Deals Delete Policy" on public.deals for delete to authenticated using (true);

-- Deal Notes
create policy "Enable read access for authenticated users" on public.deal_notes for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.deal_notes for insert to authenticated with check (true);
create policy "Deal Notes Update Policy" on public.deal_notes for update to authenticated using (true);
create policy "Deal Notes Delete Policy" on public.deal_notes for delete to authenticated using (true);

-- Sales
create policy "Enable read access for authenticated users" on public.sales for select to authenticated using (true);

-- Tags
create policy "Enable read access for authenticated users" on public.tags for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.tags for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.tags for update to authenticated using (true);
create policy "Enable delete for authenticated users only" on public.tags for delete to authenticated using (true);

-- Tasks
create policy "Enable read access for authenticated users" on public.tasks for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.tasks for insert to authenticated with check (true);
create policy "Task Update Policy" on public.tasks for update to authenticated using (true);
create policy "Task Delete Policy" on public.tasks for delete to authenticated using (true);

-- Configuration (admin-only for writes)
create policy "Enable read for authenticated" on public.configuration for select to authenticated using (true);
create policy "Enable insert for admins" on public.configuration for insert to authenticated with check (public.is_admin());
create policy "Enable update for admins" on public.configuration for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Favicons excluded domains
create policy "Enable access for authenticated users only" on public.favicons_excluded_domains to authenticated using (true) with check (true);

alter table public.subscriptions enable row level security;

create policy "Enable read access for authenticated users" on public.subscriptions for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.subscriptions for insert to authenticated with check (true);
create policy "Subscription Update Policy" on public.subscriptions for update to authenticated using (true);
create policy "Subscription Delete Policy" on public.subscriptions for delete to authenticated using (true);

alter table public.sms_campaigns enable row level security;
alter table public.sms_messages enable row level security;

create policy "Enable read access for authenticated users" on public.sms_campaigns for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.sms_campaigns for insert to authenticated with check (true);
create policy "SMS Campaign Update Policy" on public.sms_campaigns for update to authenticated using (true);
create policy "SMS Campaign Delete Policy" on public.sms_campaigns for delete to authenticated using (true);
create policy "Enable read access for authenticated users" on public.sms_messages for select to authenticated using (true);

alter table public.integration_secrets enable row level security;

alter table public.company_tags enable row level security;

create policy "Enable read access for authenticated users" on public.company_tags for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.company_tags for insert to authenticated with check (true);
create policy "Company Tag Update Policy" on public.company_tags for update to authenticated using (true);
create policy "Company Tag Delete Policy" on public.company_tags for delete to authenticated using (true);

alter table public.calls enable row level security;

-- Staff only. Guests never touch this table: they join through the call_guest
-- function, which checks the secret guest_key.
create policy "Enable read access for authenticated users" on public.calls for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.calls for insert to authenticated with check (true);
create policy "Call Update Policy" on public.calls for update to authenticated using (true);
create policy "Call Delete Policy" on public.calls for delete to authenticated using (true);

alter table public.whatsapp_messages enable row level security;

-- Staff can read the conversation; all writes go through the server functions
create policy "Enable read access for authenticated users" on public.whatsapp_messages for select to authenticated using (true);
