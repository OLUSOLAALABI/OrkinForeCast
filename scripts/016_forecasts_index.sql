-- Speed up aggregate_forecasts and branch_breakdown RPC functions.
-- Without this index, the SUM/GROUP BY across 196K+ rows can timeout on cold cache.
CREATE INDEX IF NOT EXISTS idx_forecasts_year_branch
  ON public.forecasts (year, branch_id);
