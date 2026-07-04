-- Multi-branch access for branch-level users.
-- Run this after the existing schema/migrations to allow one user account
-- to access multiple explicitly assigned branches.

CREATE TABLE IF NOT EXISTS public.user_branch_access (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, branch_id)
);

ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;

INSERT INTO public.user_branch_access (user_id, branch_id)
SELECT id, branch_id
FROM public.profiles
WHERE role = 'branch_user'
  AND branch_id IS NOT NULL
ON CONFLICT (user_id, branch_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (SELECT branch_id FROM public.profiles WHERE id = auth.uid()),
    (
      SELECT branch_id
      FROM public.user_branch_access
      WHERE user_id = auth.uid()
      ORDER BY created_at, branch_id
      LIMIT 1
    )
  );
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_branch_ids()
RETURNS UUID[] AS $$
  WITH explicit_branches AS (
    SELECT array_agg(branch_id ORDER BY created_at, branch_id) AS branch_ids
    FROM public.user_branch_access
    WHERE user_id = auth.uid()
  ), fallback_branch AS (
    SELECT branch_id FROM public.profiles WHERE id = auth.uid()
  )
  SELECT CASE
    WHEN (SELECT branch_ids FROM explicit_branches) IS NOT NULL THEN (SELECT branch_ids FROM explicit_branches)
    WHEN (SELECT branch_id FROM fallback_branch) IS NOT NULL THEN ARRAY[(SELECT branch_id FROM fallback_branch)]::UUID[]
    ELSE ARRAY[]::UUID[]
  END;
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_has_branch_access(p_branch_id UUID)
RETURNS BOOLEAN AS $$
  SELECT p_branch_id = ANY(public.get_user_branch_ids());
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_update_user_access(
  p_user_id UUID,
  p_role TEXT,
  p_region_id UUID,
  p_branch_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_ids UUID[] := ARRAY[]::UUID[];
  v_primary_branch_id UUID := NULL;
BEGIN
  IF public.get_user_role() <> 'hq_admin' THEN
    RAISE EXCEPTION 'Only HQ admins can update user access';
  END IF;

  IF p_role NOT IN ('hq_admin', 'region_admin', 'branch_user') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  SELECT COALESCE(array_agg(branch_id ORDER BY first_seen), ARRAY[]::UUID[])
  INTO v_branch_ids
  FROM (
    SELECT branch_id, MIN(ordinality) AS first_seen
    FROM unnest(COALESCE(p_branch_ids, ARRAY[]::UUID[])) WITH ORDINALITY AS branch_list(branch_id, ordinality)
    WHERE branch_id IS NOT NULL
    GROUP BY branch_id
  ) deduped;

  IF p_role = 'region_admin' AND p_region_id IS NULL THEN
    RAISE EXCEPTION 'Region is required for Region Admin';
  END IF;

  IF p_role = 'branch_user' AND COALESCE(array_length(v_branch_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one branch is required for Branch User';
  END IF;

  IF p_role = 'branch_user' THEN
    v_primary_branch_id := v_branch_ids[1];
  END IF;

  UPDATE public.profiles
  SET role = p_role,
      region_id = CASE WHEN p_role = 'region_admin' THEN p_region_id ELSE NULL END,
      branch_id = v_primary_branch_id,
      updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  DELETE FROM public.user_branch_access
  WHERE user_id = p_user_id;

  IF p_role = 'branch_user' THEN
    INSERT INTO public.user_branch_access (user_id, branch_id)
    SELECT p_user_id, branch_id
    FROM unnest(v_branch_ids) AS branch_id;
  END IF;
END;
$$;

DROP POLICY IF EXISTS "user_branch_access_select_self_or_hq" ON public.user_branch_access;
DROP POLICY IF EXISTS "user_branch_access_manage_hq" ON public.user_branch_access;

CREATE POLICY "user_branch_access_select_self_or_hq" ON public.user_branch_access
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.get_user_role() = 'hq_admin');

CREATE POLICY "user_branch_access_manage_hq" ON public.user_branch_access
  FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'hq_admin')
  WITH CHECK (public.get_user_role() = 'hq_admin');

DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches FOR SELECT USING (
  auth.uid() IS NULL OR
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND region_id = public.get_user_region_id()) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(id))
);

DROP POLICY IF EXISTS "uploads_select" ON public.uploads;
CREATE POLICY "uploads_select" ON public.uploads FOR SELECT USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

DROP POLICY IF EXISTS "uploads_insert" ON public.uploads;
CREATE POLICY "uploads_insert" ON public.uploads FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (
    public.get_user_role() = 'hq_admin' OR
    (public.get_user_role() = 'region_admin' AND branch_id IN (
      SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
    )) OR
    (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
  )
);

DROP POLICY IF EXISTS "actuals_select" ON public.actuals;
CREATE POLICY "actuals_select" ON public.actuals FOR SELECT USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

DROP POLICY IF EXISTS "actuals_insert" ON public.actuals;
CREATE POLICY "actuals_insert" ON public.actuals FOR INSERT WITH CHECK (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

DROP POLICY IF EXISTS "actuals_update" ON public.actuals;
CREATE POLICY "actuals_update" ON public.actuals FOR UPDATE USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

DROP POLICY IF EXISTS "forecasts_select" ON public.forecasts;
CREATE POLICY "forecasts_select" ON public.forecasts FOR SELECT USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

DROP POLICY IF EXISTS "forecasts_insert" ON public.forecasts;
CREATE POLICY "forecasts_insert" ON public.forecasts FOR INSERT WITH CHECK (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

DROP POLICY IF EXISTS "forecasts_update" ON public.forecasts;
CREATE POLICY "forecasts_update" ON public.forecasts FOR UPDATE USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

DROP POLICY IF EXISTS "branch_user_select_audit_log" ON public.forecast_audit_log;
CREATE POLICY "branch_user_select_audit_log" ON public.forecast_audit_log
  FOR SELECT
  TO authenticated
  USING (public.user_has_branch_access(forecast_audit_log.branch_id));

DROP POLICY IF EXISTS "authenticated_select_actuals" ON public.last_month_actuals;
CREATE POLICY "authenticated_select_actuals" ON public.last_month_actuals
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'hq_admin' OR
    (public.get_user_role() = 'region_admin' AND (
      (region_id IS NOT NULL AND region_id = public.get_user_region_id()) OR
      (branch_id IS NOT NULL AND branch_id IN (
        SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
      ))
    )) OR
    (public.get_user_role() = 'branch_user' AND branch_id IS NOT NULL AND public.user_has_branch_access(branch_id))
  );

GRANT ALL ON public.user_branch_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_access(UUID, TEXT, UUID, UUID[]) TO authenticated;
NOTIFY pgrst, 'reload schema';