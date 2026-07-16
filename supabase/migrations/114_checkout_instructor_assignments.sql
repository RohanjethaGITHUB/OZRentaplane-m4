-- 114_checkout_instructor_assignments.sql

-- Create the append-only assignment history table
CREATE TABLE public.checkout_instructor_assignments (
  id             uuid primary key default gen_random_uuid(),
  checkout_id    uuid not null references public.bookings(id) on delete cascade,
  instructor_id  uuid not null references auth.users(id),
  assigned_by    uuid not null references auth.users(id),
  status         text not null default 'pending'
                 check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'reassigned', 'cancelled')),
  is_active      boolean not null default true,
  reason         text,
  created_at     timestamptz not null default now(),
  responded_at   timestamptz
);

-- Indexes for efficient querying
CREATE INDEX idx_checkout_instructor_assignments_checkout_id ON public.checkout_instructor_assignments (checkout_id);
CREATE INDEX idx_checkout_instructor_assignments_instructor_id ON public.checkout_instructor_assignments (instructor_id);

-- Partial unique index to guarantee only one active assignment per checkout at a time
CREATE UNIQUE INDEX idx_checkout_instructor_assignments_active_unique 
  ON public.checkout_instructor_assignments (checkout_id) 
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.checkout_instructor_assignments ENABLE ROW LEVEL SECURITY;

-- Admin: all access
CREATE POLICY "admin_all" ON public.checkout_instructor_assignments
  FOR ALL TO authenticated
  USING (public.get_own_role() = 'admin')
  WITH CHECK (public.get_own_role() = 'admin');

-- Instructor: read-only access to their own assignments
CREATE POLICY "instructor_read_own" ON public.checkout_instructor_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() = instructor_id);
