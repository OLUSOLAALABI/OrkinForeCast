-- Last month actuals table for uploaded P&L data
CREATE TABLE IF NOT EXISTS public.last_month_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  region_id UUID REFERENCES public.regions(id) ON DELETE CASCADE,
  is_company_wide BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Exactly one scope must be set
  CONSTRAINT one_scope CHECK (
    (branch_id IS NOT NULL AND region_id IS NULL AND is_company_wide = false) OR
    (branch_id IS NULL AND region_id IS NOT NULL AND is_company_wide = false) OR
    (branch_id IS NULL AND region_id IS NULL AND is_company_wide = true)
  )
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lma_branch
  ON public.last_month_actuals(branch_id, year, month);

CREATE INDEX IF NOT EXISTS idx_lma_region
  ON public.last_month_actuals(region_id, year, month);

CREATE INDEX IF NOT EXISTS idx_lma_company
  ON public.last_month_actuals(is_company_wide, year, month)
  WHERE is_company_wide = true;

-- Unique constraint to prevent duplicate rows per scope+description+period
CREATE UNIQUE INDEX IF NOT EXISTS idx_lma_branch_unique
  ON public.last_month_actuals(branch_id, description, year, month)
  WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lma_region_unique
  ON public.last_month_actuals(region_id, description, year, month)
  WHERE region_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lma_company_unique
  ON public.last_month_actuals(description, year, month)
  WHERE is_company_wide = true;

-- RLS
ALTER TABLE public.last_month_actuals ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read actuals
CREATE POLICY "authenticated_select_actuals" ON public.last_month_actuals
  FOR SELECT
  TO authenticated
  USING (true);

-- Only HQ admins can insert
CREATE POLICY "hq_admin_insert_actuals" ON public.last_month_actuals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'hq_admin'
    )
  );

-- Only HQ admins can delete (for clean re-upload)
CREATE POLICY "hq_admin_delete_actuals" ON public.last_month_actuals
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'hq_admin'
    )
  );

-- Grant access to PostgREST roles
GRANT ALL ON public.last_month_actuals TO authenticated;
GRANT SELECT ON public.last_month_actuals TO anon;
NOTIFY pgrst, 'reload schema';
