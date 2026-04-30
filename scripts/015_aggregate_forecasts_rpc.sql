-- RPC function: aggregate forecasts across branches for HQ/region summary view.
-- Returns ~2000 rows (description × month) instead of 196K raw rows.
-- This makes HQ page load sub-second instead of 2+ minutes.

CREATE OR REPLACE FUNCTION public.aggregate_forecasts(
  p_branch_ids UUID[],
  p_year INTEGER
)
RETURNS TABLE (
  description TEXT,
  month INTEGER,
  forecast_value NUMERIC,
  budget_value NUMERIC,
  last_month_value NUMERIC,
  last_year_value NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    f.description,
    f.month,
    SUM(f.forecast_value)::NUMERIC AS forecast_value,
    SUM(f.budget_value)::NUMERIC AS budget_value,
    SUM(f.last_month_value)::NUMERIC AS last_month_value,
    SUM(f.last_year_value)::NUMERIC AS last_year_value
  FROM public.forecasts f
  WHERE f.branch_id = ANY(p_branch_ids)
    AND f.year = p_year
  GROUP BY f.description, f.month
  ORDER BY f.description, f.month;
$$;

-- Grant execute to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.aggregate_forecasts(UUID[], INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_forecasts(UUID[], INTEGER) TO anon;

-- Second RPC: per-branch breakdown for a single month (for branch contribution table)
-- Returns only the 3 key subtotal rows per branch for the selected month.
CREATE OR REPLACE FUNCTION public.branch_breakdown(
  p_branch_ids UUID[],
  p_year INTEGER,
  p_month INTEGER
)
RETURNS TABLE (
  branch_id UUID,
  description TEXT,
  forecast_value NUMERIC,
  budget_value NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    f.branch_id,
    f.description,
    f.forecast_value::NUMERIC,
    f.budget_value::NUMERIC
  FROM public.forecasts f
  WHERE f.branch_id = ANY(p_branch_ids)
    AND f.year = p_year
    AND f.month = p_month
    AND f.description IN ('TOTAL NET REVENUE', 'TOTAL EXPENSES', 'CONTRIBUTION B/4 OVERHEAD')
  ORDER BY f.branch_id, f.description;
$$;

GRANT EXECUTE ON FUNCTION public.branch_breakdown(UUID[], INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branch_breakdown(UUID[], INTEGER, INTEGER) TO anon;
