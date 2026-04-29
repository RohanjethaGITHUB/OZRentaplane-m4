-- Login tracking: first-time vs returning greeting, session history
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_login_at             timestamptz,
  ADD COLUMN IF NOT EXISTS login_count               integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_bookings_viewed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_notification_seen_at timestamptz;

-- Seed existing users as returning (login_count = 1) so they see "Welcome back"
-- on their first login after this migration goes live.
-- New users sign up with login_count = 0 and will see "Welcome" on first login.
UPDATE profiles SET login_count = 1 WHERE login_count = 0;
