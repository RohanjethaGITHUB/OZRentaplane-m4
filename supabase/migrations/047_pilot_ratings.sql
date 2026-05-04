-- Migration: Add Night VFR and Instrument Rating fields to profiles
-- These are pilot privilege flags, not document attributes.
-- Nullable booleans: true = yes, false = no, null = not yet answered.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_night_vfr_rating   boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_instrument_rating  boolean DEFAULT NULL;
