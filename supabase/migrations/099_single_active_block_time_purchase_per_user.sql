CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_block_time_purchase_per_user
ON public.pilot_block_time_purchases (user_id)
WHERE status = 'active';
