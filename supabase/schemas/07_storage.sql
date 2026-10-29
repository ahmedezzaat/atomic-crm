--
-- Storage
-- This file declares storage bucket policies.
--

create policy "Attachments 1mt4rzk_0" on storage.objects for select to authenticated using (bucket_id = 'attachments');
create policy "Attachments 1mt4rzk_1" on storage.objects for insert to authenticated with check (bucket_id = 'attachments');
create policy "Attachments 1mt4rzk_3" on storage.objects for delete to authenticated using (bucket_id = 'attachments');

-- Call recordings (private bucket created by the call_recordings migration)
create policy "Call recordings select" on storage.objects for select to authenticated using (bucket_id = 'call-recordings');
create policy "Call recordings insert" on storage.objects for insert to authenticated with check (bucket_id = 'call-recordings');
create policy "Call recordings update" on storage.objects for update to authenticated using (bucket_id = 'call-recordings');
create policy "Call recordings delete" on storage.objects for delete to authenticated using (bucket_id = 'call-recordings');
