UPDATE public.block_time_packages
SET validity_days = CASE name
  WHEN 'Starter Block' THEN 30
  WHEN 'Regular Block' THEN 60
  WHEN 'Committed Block' THEN 90
  WHEN 'Pro Block' THEN 180
  ELSE validity_days
END
WHERE name IN ('Starter Block', 'Regular Block', 'Committed Block', 'Pro Block');
