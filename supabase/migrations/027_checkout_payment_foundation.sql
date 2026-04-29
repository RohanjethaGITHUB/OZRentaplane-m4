-- ============================================================
-- 027_checkout_payment_foundation.sql
--
-- Introduces the foundation for checkout invoice payments:
-- 1. customer_payment_ledger
-- 2. checkout_invoices
-- 3. Adds 'checkout_payment_required' to bookings_status_check
-- ============================================================

-- ── 1. Create customer_payment_ledger ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_payment_ledger (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
    invoice_id uuid, -- Will reference checkout_invoices once it's created
    amount_cents integer NOT NULL,
    currency text NOT NULL DEFAULT 'aud',
    entry_type text NOT NULL,
    payment_method text,
    note text,
    stripe_payment_intent_id text,
    stripe_checkout_session_id text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- ── 2. Create checkout_invoices ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checkout_invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    invoice_number text UNIQUE,
    invoice_type text NOT NULL DEFAULT 'checkout',
    status text NOT NULL DEFAULT 'draft',
    currency text NOT NULL DEFAULT 'aud',
    subtotal_cents integer NOT NULL DEFAULT 29000,
    advance_applied_cents integer NOT NULL DEFAULT 0,
    stripe_amount_due_cents integer NOT NULL DEFAULT 29000,
    total_paid_cents integer NOT NULL DEFAULT 0,
    stripe_checkout_session_id text,
    stripe_payment_intent_id text,
    paid_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Establish foreign key for ledger -> invoice
ALTER TABLE public.customer_payment_ledger
    DROP CONSTRAINT IF EXISTS fk_ledger_invoice;
ALTER TABLE public.customer_payment_ledger
    ADD CONSTRAINT fk_ledger_invoice
    FOREIGN KEY (invoice_id) REFERENCES public.checkout_invoices(id) ON DELETE SET NULL;

-- ── 3. Constraints & Triggers ────────────────────────────────────────────────

ALTER TABLE public.customer_payment_ledger
    DROP CONSTRAINT IF EXISTS valid_entry_type;
ALTER TABLE public.customer_payment_ledger
    ADD CONSTRAINT valid_entry_type
    CHECK (entry_type IN ('advance_credit', 'advance_applied', 'stripe_payment', 'refund', 'manual_adjustment'));

ALTER TABLE public.checkout_invoices
    DROP CONSTRAINT IF EXISTS valid_invoice_status;
ALTER TABLE public.checkout_invoices
    ADD CONSTRAINT valid_invoice_status
    CHECK (status IN ('draft', 'payment_required', 'paid', 'void', 'failed'));

DROP TRIGGER IF EXISTS update_checkout_invoices_updated_at ON public.checkout_invoices;
CREATE TRIGGER update_checkout_invoices_updated_at
    BEFORE UPDATE ON public.checkout_invoices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE public.customer_payment_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own ledger" ON public.customer_payment_ledger;
CREATE POLICY "Customers can view own ledger" ON public.customer_payment_ledger
    FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Admin full access ledger" ON public.customer_payment_ledger;
CREATE POLICY "Admin full access ledger" ON public.customer_payment_ledger
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Customers can view own invoices" ON public.checkout_invoices;
CREATE POLICY "Customers can view own invoices" ON public.checkout_invoices
    FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Admin full access invoices" ON public.checkout_invoices;
CREATE POLICY "Admin full access invoices" ON public.checkout_invoices
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── 5. Add 'checkout_payment_required' to bookings_status_check ───────────────

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    -- Standard booking lifecycle
    'draft', 'pending_confirmation', 'confirmed', 'ready_for_dispatch',
    'dispatched', 'awaiting_flight_record', 'flight_record_overdue',
    'pending_post_flight_review', 'needs_clarification', 'post_flight_approved',
    'invoice_generated', 'payment_pending', 'paid', 'completed',
    'cancelled', 'no_show', 'overdue', 'admin_hold',
    -- Checkout booking statuses
    'checkout_requested',
    'checkout_confirmed',
    'checkout_completed_under_review',
    'checkout_payment_required', -- NEW
    -- First solo reservation
    'pending_checkout_clearance',
    -- Released because checkout outcome was not cleared
    'released_due_to_checkout'
  ));
