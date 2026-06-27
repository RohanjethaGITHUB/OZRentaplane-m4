-- ============================================================
-- OZ RENT A PLANE — NEW TABLES SCHEMA
-- Block Time & Invoice System
-- ============================================================
-- Run order:
--   1. block_time_packages        (static catalogue, no FK deps)
--   2. pilot_block_time_purchases (depends on block_time_packages + users)
--   3. invoices                   (depends on users + bookings + purchases)
--   4. invoice_line_items         (depends on invoices)
--   5. pilot_block_time_usage     (depends on purchases + bookings + invoices)
-- ============================================================


-- ------------------------------------------------------------
-- TABLE 1: block_time_packages
-- Static product catalogue. Seeded once, rarely changes.
-- ------------------------------------------------------------
CREATE TABLE block_time_packages (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  name              text          NOT NULL,
  -- e.g. "Starter Block", "Regular Block", "Committed Block", "Pro Block"

  hours             integer       NOT NULL CHECK (hours > 0),
  -- 10 / 25 / 50 / 100

  rate_per_hour     numeric(10,2) NOT NULL CHECK (rate_per_hour > 0),
  -- 320.00 / 310.00 / 300.00 / 290.00

  total_price       numeric(10,2) GENERATED ALWAYS AS (hours * rate_per_hour) STORED,
  -- Computed: hours × rate. e.g. 25 × 310 = 7750.00

  validity_days     integer       NOT NULL CHECK (validity_days > 0),
  -- 30 / 90 / 180 / 270

  is_active         boolean       NOT NULL DEFAULT true,
  -- Soft disable a package without deleting it

  display_order     integer       NOT NULL DEFAULT 0,
  -- Controls order on marketing page (ascending)

  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

-- Seed data — run immediately after table creation
INSERT INTO block_time_packages (name, hours, rate_per_hour, validity_days, display_order) VALUES
  ('Starter Block',    10,  320.00,  30,  1),
  ('Regular Block',    25,  310.00,  90,  2),
  ('Committed Block',  50,  300.00,  180, 3),
  ('Pro Block',        100, 290.00,  270, 4);

-- Index for marketing page ordering
CREATE INDEX idx_block_time_packages_display_order
  ON block_time_packages (display_order)
  WHERE is_active = true;


-- ------------------------------------------------------------
-- TABLE 2: pilot_block_time_purchases
-- Every time a pilot buys a Block Time package.
-- One row per purchase. FIFO queue via purchased_at ordering.
-- ------------------------------------------------------------
CREATE TABLE pilot_block_time_purchases (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id                   uuid          NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  -- RESTRICT: don't allow user deletion if purchases exist

  package_id                uuid          NOT NULL REFERENCES block_time_packages (id) ON DELETE RESTRICT,

  -- Hours
  hours_purchased           numeric(8,2)  NOT NULL CHECK (hours_purchased > 0),
  -- Snapshot of package hours at time of purchase (in case package catalogue changes)

  hours_remaining           numeric(8,2)  NOT NULL CHECK (hours_remaining >= 0),
  -- Decremented on every flight deduction. Never goes below 0.

  -- Rate locked in at time of purchase — never changes
  rate_per_hour             numeric(10,2) NOT NULL CHECK (rate_per_hour > 0),

  -- Computed total paid (hours_purchased × rate_per_hour)
  amount_paid               numeric(10,2) NOT NULL CHECK (amount_paid > 0),

  -- Status lifecycle:
  --   pending    → payment initiated but webhook not yet received
  --   active     → payment confirmed, hours available, not expired
  --   exhausted  → hours_remaining = 0
  --   expired    → expires_at passed with hours_remaining > 0
  --   refunded   → refund processed, package closed
  status                    text          NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'active', 'exhausted', 'expired', 'refunded')),

  -- Validity window
  purchased_at              timestamptz   NOT NULL DEFAULT now(),
  activated_at              timestamptz,
  -- Set when webhook confirms payment and status → active

  expires_at                timestamptz   NOT NULL,
  -- Set at activation: activated_at + validity_days interval
  -- NOT set at purchase time — set when payment confirms
  -- to avoid validity window being eaten by pending payment delay

  -- Stripe
  stripe_payment_intent_id  text          UNIQUE,
  -- Stored as soon as PaymentIntent is created (even before webhook)

  -- Queue position for FIFO multi-package logic
  -- Lower number = used first. Set at activation time.
  queue_position            integer,

  -- Refund tracking
  refund_amount             numeric(10,2),
  refunded_at               timestamptz,
  refund_stripe_id          text,
  -- Stripe refund object ID

  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_bt_purchases_user_id
  ON pilot_block_time_purchases (user_id);

CREATE INDEX idx_bt_purchases_user_active
  ON pilot_block_time_purchases (user_id, status, expires_at)
  WHERE status = 'active';
-- Used by booking flow to find active balance quickly

CREATE INDEX idx_bt_purchases_expiry
  ON pilot_block_time_purchases (expires_at, status)
  WHERE status = 'active';
-- Used by expiry cron job

CREATE INDEX idx_bt_purchases_stripe
  ON pilot_block_time_purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
-- Used by Stripe webhook handler


-- ------------------------------------------------------------
-- TABLE 3: invoices
-- Master invoice record for every financial event.
-- Types: block_time_purchase | flight | credit_note
-- ------------------------------------------------------------

-- Auto-incrementing invoice number sequence
-- Global counter across all invoice types, resets per year
-- Format: OZ-YYYY-NNNNN
CREATE SEQUENCE invoice_number_seq START 1;

CREATE TABLE invoices (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Invoice number: OZ-2026-00001
  -- Generated at insert time via trigger (see below)
  invoice_number            text          NOT NULL UNIQUE,

  type                      text          NOT NULL
                            CHECK (type IN ('block_time_purchase', 'flight', 'credit_note')),

  -- Linked entities (some nullable depending on type)
  user_id                   uuid          NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,

  booking_id                uuid,
  -- Nullable: only set for flight invoices
  -- FK added after audit confirms bookings table name + PK type
  -- REFERENCES bookings (id) ON DELETE RESTRICT

  block_time_purchase_id    uuid          REFERENCES pilot_block_time_purchases (id) ON DELETE RESTRICT,
  -- Set for block_time_purchase invoices and flight invoices where billing_mode = block_time

  related_invoice_id        uuid          REFERENCES invoices (id) ON DELETE RESTRICT,
  -- Set for credit_note type: points to the original invoice being credited

  -- Billing mode snapshot (for flight invoices)
  billing_mode              text          CHECK (billing_mode IN ('pay_as_you_fly', 'block_time')),

  -- Financial amounts (all in AUD, GST inclusive pricing)
  subtotal                  numeric(10,2) NOT NULL CHECK (subtotal >= 0),
  -- Amount excluding GST

  gst_amount                numeric(10,2) NOT NULL CHECK (gst_amount >= 0),
  -- Always subtotal / 10 (10% GST)
  -- Constraint: gst_amount = ROUND(subtotal / 10, 2)

  total                     numeric(10,2) NOT NULL CHECK (total >= 0),
  -- subtotal + gst_amount

  -- Status lifecycle:
  --   draft      → created but not yet finalised (rare, for edge cases)
  --   paid       → payment confirmed
  --   awaiting   → bank transfer issued, awaiting admin confirmation (PAYF only)
  --   void       → cancelled before payment
  --   refunded   → full or partial refund processed
  status                    text          NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'paid', 'awaiting', 'void', 'refunded')),

  -- Payment method
  payment_method            text          CHECK (payment_method IN ('stripe', 'bank_transfer')),

  -- Stripe
  stripe_payment_intent_id  text,

  -- Bank transfer (PAYF only)
  bank_transfer_reference   text,
  bank_transfer_confirmed_at timestamptz,
  bank_transfer_confirmed_by uuid,
  -- FK to admin user who confirmed it

  -- PDF storage
  pdf_url                   text,
  -- Path in Supabase Storage: invoices/{user_id}/{invoice_number}.pdf
  -- Populated after PDF is generated

  -- Timestamps
  paid_at                   timestamptz,
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

-- Invoice number generation trigger
-- Produces: OZ-2026-00001 format
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_number := 'OZ-' ||
    TO_CHAR(NOW(), 'YYYY') || '-' ||
    LPAD(NEXTVAL('invoice_number_seq')::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION generate_invoice_number();

-- NOTE: invoice_number_seq resets annually.
-- Add a scheduled job (pg_cron or external cron) to run on Jan 1:
--   ALTER SEQUENCE invoice_number_seq RESTART WITH 1;

-- Indexes
CREATE INDEX idx_invoices_user_id
  ON invoices (user_id, created_at DESC);

CREATE INDEX idx_invoices_booking_id
  ON invoices (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX idx_invoices_purchase_id
  ON invoices (block_time_purchase_id)
  WHERE block_time_purchase_id IS NOT NULL;

CREATE INDEX idx_invoices_status
  ON invoices (status, created_at DESC);

CREATE INDEX idx_invoices_stripe
  ON invoices (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX idx_invoices_number
  ON invoices (invoice_number);


-- ------------------------------------------------------------
-- TABLE 4: invoice_line_items
-- Individual line items within an invoice.
-- Every invoice has at least 1 line item.
-- ------------------------------------------------------------
CREATE TABLE invoice_line_items (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  invoice_id      uuid          NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  -- CASCADE: line items are deleted with their invoice

  type            text          NOT NULL
                  CHECK (type IN (
                    'flight_hours',     -- Standard flight hours charge
                    'block_time_hours', -- Block Time package purchase
                    'overflow_hours',   -- Hours beyond BT balance, charged at block rate
                    'landing_fee',      -- Per-landing charge
                    'overnight_parking' -- Overnight parking fee
                  )),

  description     text          NOT NULL,
  -- Human-readable. e.g.:
  -- "Aircraft Hire — VH-OZA Cessna 172N (3.5 hrs @ $330/hr)"
  -- "Block Time Package — 25 Hours"
  -- "Landing Fee — Bankstown (YSBK)"

  quantity        numeric(8,2)  NOT NULL CHECK (quantity > 0),
  -- Hours for flight items, count for landings/parking nights

  unit_price      numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  -- Price per unit excluding GST

  amount          numeric(10,2) NOT NULL CHECK (amount >= 0),
  -- quantity × unit_price (computed at insert, stored for immutability)

  display_order   integer       NOT NULL DEFAULT 0,
  -- Controls line item order on the invoice PDF

  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- Index for fetching all line items for an invoice
CREATE INDEX idx_line_items_invoice_id
  ON invoice_line_items (invoice_id, display_order);


-- ------------------------------------------------------------
-- TABLE 5: pilot_block_time_usage
-- Ledger of every hour deduction from a Block Time purchase.
-- Immutable — never updated, only inserted.
-- ------------------------------------------------------------
CREATE TABLE pilot_block_time_usage (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  purchase_id           uuid          NOT NULL REFERENCES pilot_block_time_purchases (id) ON DELETE RESTRICT,

  user_id               uuid          NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,

  booking_id            uuid          NOT NULL,
  -- FK added after audit confirms bookings table name + PK type
  -- REFERENCES bookings (id) ON DELETE RESTRICT

  invoice_id            uuid          REFERENCES invoices (id) ON DELETE RESTRICT,
  -- The flight invoice this deduction is associated with

  -- Hours
  hours_deducted        numeric(8,2)  NOT NULL CHECK (hours_deducted > 0),
  -- Actual VDO hours drawn from this purchase

  overflow_hours        numeric(8,2)  NOT NULL DEFAULT 0 CHECK (overflow_hours >= 0),
  -- Hours that exceeded the balance and were charged at block rate
  -- 0 in the normal case

  overflow_amount       numeric(10,2) NOT NULL DEFAULT 0 CHECK (overflow_amount >= 0),
  -- overflow_hours × rate_per_hour

  hours_before          numeric(8,2)  NOT NULL CHECK (hours_before >= 0),
  -- Balance before this deduction (for audit trail)

  hours_after           numeric(8,2)  NOT NULL CHECK (hours_after >= 0),
  -- Balance after this deduction (should equal hours_before - hours_deducted)

  deducted_at           timestamptz   NOT NULL DEFAULT now(),

  created_at            timestamptz   NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_bt_usage_purchase_id
  ON pilot_block_time_usage (purchase_id, deducted_at DESC);

CREATE INDEX idx_bt_usage_user_id
  ON pilot_block_time_usage (user_id, deducted_at DESC);

CREATE INDEX idx_bt_usage_booking_id
  ON pilot_block_time_usage (booking_id);


-- ------------------------------------------------------------
-- UPDATED_AT TRIGGERS
-- Keep updated_at current on mutable tables
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_bt_packages_updated_at
  BEFORE UPDATE ON block_time_packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_bt_purchases_updated_at
  BEFORE UPDATE ON pilot_block_time_purchases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- pilot_block_time_usage is immutable — no updated_at trigger needed


-- ------------------------------------------------------------
-- NOTES FOR AUDIT
-- ------------------------------------------------------------
-- The following FKs are intentionally left as comments until
-- the codebase audit confirms exact table names and PK types:
--
--   invoices.booking_id
--     → REFERENCES bookings (id) ON DELETE RESTRICT
--
--   pilot_block_time_usage.booking_id
--     → REFERENCES bookings (id) ON DELETE RESTRICT
--
-- If bookings.id is bigint rather than uuid, the column types
-- above must be changed to match before running this migration.
--
-- Also confirm: auth.users is the correct user table reference
-- for this Supabase project (standard for Supabase Auth).
-- ------------------------------------------------------------
