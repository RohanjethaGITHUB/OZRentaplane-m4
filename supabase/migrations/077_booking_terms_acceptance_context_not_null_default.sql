-- Ensure booking_terms_acceptances.acceptance_context is present and safe for all insert paths.
alter table public.booking_terms_acceptances
  add column if not exists acceptance_context text;

update public.booking_terms_acceptances
set acceptance_context = coalesce(nullif(trim(acceptance_context), ''), 'standard')
where acceptance_context is null or trim(acceptance_context) = '';

alter table public.booking_terms_acceptances
  alter column acceptance_context set default 'standard';

alter table public.booking_terms_acceptances
  alter column acceptance_context set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_terms_acceptances_context_check'
      and conrelid = 'public.booking_terms_acceptances'::regclass
  ) then
    alter table public.booking_terms_acceptances
      add constraint booking_terms_acceptances_context_check
      check (acceptance_context in ('checkout', 'booking', 'booking_readiness', 'standard'));
  end if;
end
$$;

notify pgrst, 'reload schema';
