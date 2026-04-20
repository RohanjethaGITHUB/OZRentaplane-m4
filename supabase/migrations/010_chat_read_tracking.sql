-- ─── 010_chat_read_tracking.sql ──────────────────────────────────────────────
-- Adds per-role read tracking to verification_events so both admin and customer
-- can independently track unread messages in the chat thread.
--
-- Strategy:
--   • is_read (existing) remains the customer-side "have I read this?" flag
--   • admin_read_at (new) tracks when the admin last viewed this event
--
-- Admin unread = actor_role = 'customer' AND admin_read_at IS NULL
-- Customer unread = is_read = false (existing behaviour, unchanged)
-- ─────────────────────────────────────────────────────────────────────────────

-- Add admin-side read timestamp (nullable — NULL means unread by admin)
ALTER TABLE verification_events
  ADD COLUMN IF NOT EXISTS admin_read_at TIMESTAMPTZ DEFAULT NULL;

-- For pre-existing events where the admin has clearly already seen them
-- (any event that's older than this migration) mark them as read so the
-- admin doesn't get flooded with stale unread counts on first deploy.
-- We only do this for non-customer-message events; new customer messages
-- will correctly arrive as unread.
UPDATE verification_events
  SET admin_read_at = created_at
  WHERE actor_role IN ('admin', 'system');

-- Index: fast unread count per customer for the admin sidebar/list
CREATE INDEX IF NOT EXISTS idx_verification_events_admin_unread
  ON verification_events (user_id, admin_read_at)
  WHERE actor_role = 'customer' AND admin_read_at IS NULL;

-- Index: fast unread count for a single customer's thread (admin detail page)
CREATE INDEX IF NOT EXISTS idx_verification_events_user_unread
  ON verification_events (user_id, is_read)
  WHERE is_read = false;
