alter table public.calls
    add column recording boolean not null default true,
    add column recording_path text,
    add column processing_status text not null default 'none',
    add column processing_error text,
    add column transcript text,
    add column summary text,
    add column key_points jsonb not null default '[]'::jsonb,
    add column action_items jsonb not null default '[]'::jsonb,
    add constraint calls_processing_status_check check (processing_status in ('none', 'uploading', 'transcribing', 'summarizing', 'done', 'failed'));

-- Private bucket: staff play recordings through signed links
insert into storage.buckets (id, name, public, file_size_limit)
values ('call-recordings', 'call-recordings', false, 52428800)
on conflict (id) do nothing;

create policy "Call recordings select" on storage.objects for select to authenticated using (bucket_id = 'call-recordings');
create policy "Call recordings insert" on storage.objects for insert to authenticated with check (bucket_id = 'call-recordings');
create policy "Call recordings update" on storage.objects for update to authenticated using (bucket_id = 'call-recordings');
create policy "Call recordings delete" on storage.objects for delete to authenticated using (bucket_id = 'call-recordings');
