-- Fix description names in forecasts table to match canonical template
-- 1. Rename "PC MGMT FAILURE" → "PC COMM MGMT FAILURE"
-- 2. Rename "ULTIPRO FEES" → "ULTIPRO COST"

-- Forecasts table
UPDATE public.forecasts
SET description = 'PC COMM MGMT FAILURE'
WHERE description = 'PC MGMT FAILURE';

UPDATE public.forecasts
SET description = 'ULTIPRO COST'
WHERE description = 'ULTIPRO FEES';

-- Actuals table (if any rows exist)
UPDATE public.actuals
SET description = 'PC COMM MGMT FAILURE'
WHERE description = 'PC MGMT FAILURE';

UPDATE public.actuals
SET description = 'ULTIPRO COST'
WHERE description = 'ULTIPRO FEES';

-- Last month actuals table
UPDATE public.last_month_actuals
SET description = 'PC COMM MGMT FAILURE'
WHERE description = 'PC MGMT FAILURE';

UPDATE public.last_month_actuals
SET description = 'ULTIPRO COST'
WHERE description = 'ULTIPRO FEES';

-- Audit log (for historical accuracy, leave as-is)

-- 3. Insert RESIDENTIAL MGMT FAILURE rows for any branch+year+month
--    that has PC COMM MGMT FAILURE but is missing RESIDENTIAL MGMT FAILURE.
--    Default to 0 values.
INSERT INTO public.forecasts (branch_id, description, year, month, forecast_value, budget_value, last_month_value, last_year_value)
SELECT f.branch_id, 'RESIDENTIAL MGMT FAILURE', f.year, f.month, 0, 0, 0, 0
FROM public.forecasts f
WHERE f.description = 'PC COMM MGMT FAILURE'
  AND NOT EXISTS (
    SELECT 1 FROM public.forecasts f2
    WHERE f2.branch_id = f.branch_id
      AND f2.description = 'RESIDENTIAL MGMT FAILURE'
      AND f2.year = f.year
      AND f2.month = f.month
  );

-- Similarly insert TC MGMT FAILURE if missing
INSERT INTO public.forecasts (branch_id, description, year, month, forecast_value, budget_value, last_month_value, last_year_value)
SELECT f.branch_id, 'TC MGMT FAILURE', f.year, f.month, 0, 0, 0, 0
FROM public.forecasts f
WHERE f.description = 'TOTAL NET TC REVENUE'
  AND NOT EXISTS (
    SELECT 1 FROM public.forecasts f2
    WHERE f2.branch_id = f.branch_id
      AND f2.description = 'TC MGMT FAILURE'
      AND f2.year = f.year
      AND f2.month = f.month
  );
