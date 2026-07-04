-- Allow authenticated users to read the currently active terms document.
-- This keeps the access model consistent with other public reference tables
-- while still limiting customer reads to active rows only.

alter table public.terms_documents enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'terms_documents'
      and policyname = 'Authenticated users can read active terms documents'
  ) then
    create policy "Authenticated users can read active terms documents"
      on public.terms_documents
      for select
      to authenticated
      using (is_active = true);
  end if;
end
$$;

notify pgrst, 'reload schema';
