-- Audit log for manual forecast edits
CREATE TABLE IF NOT EXISTS public.forecast_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  old_value DECIMAL(15, 2) NOT NULL,
  new_value DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by branch and recency
CREATE INDEX IF NOT EXISTS idx_forecast_audit_log_branch
  ON public.forecast_audit_log(branch_id, created_at DESC);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_forecast_audit_log_user
  ON public.forecast_audit_log(user_id, created_at DESC);

-- RLS policies
ALTER TABLE public.forecast_audit_log ENABLE ROW LEVEL SECURITY;

-- HQ admins can see all audit log entries
CREATE POLICY "hq_admin_select_audit_log" ON public.forecast_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'hq_admin'
    )
  );

-- Region admins can see audit log entries for branches in their region
CREATE POLICY "region_admin_select_audit_log" ON public.forecast_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.branches b ON b.region_id = p.region_id
      WHERE p.id = auth.uid()
      AND p.role = 'region_admin'
      AND b.id = forecast_audit_log.branch_id
    )
  );

-- Branch users can see audit log entries for their own branch
CREATE POLICY "branch_user_select_audit_log" ON public.forecast_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.branch_id = forecast_audit_log.branch_id
    )
  );

-- Any authenticated user can insert audit log entries (the app controls when)
CREATE POLICY "authenticated_insert_audit_log" ON public.forecast_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
