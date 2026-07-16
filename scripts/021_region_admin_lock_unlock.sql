-- Allow region admins to lock and unlock forecast months for branches
-- in their own region, in addition to the existing HQ admin and branch
-- user (own branch) permissions. Activity logging is automatic: every
-- successful call to set_forecast_month_status inserts a row into
-- forecast_month_status_history with actor_user_id = auth.uid() and the
-- supplied note, so region admin actions show up in the Activity page
-- under Forecast Verification > History with no further plumbing.
--
-- This migration does NOT touch:
--   * forecast_month_status or forecast_month_status_history tables
--   * prevent_completed_forecast_updates trigger (still blocks UPDATE on
--     completed months regardless of actor)
--   * forecast_month_status(_history)_select RLS policies — the existing
--     region_admin clause already lets a region admin see their region's
--     events, so the new actions are surfaced in the Activity page
--     without any RLS change.
--
-- Requires: scripts/001_create_schema.sql (helper: get_user_role,
-- get_user_region_id), scripts/018_forecast_month_status.sql (target
-- function: set_forecast_month_status).

-- ── Helper: does the current user have region-scope on this branch? ──
-- Mirrors user_has_branch_access (SECURITY DEFINER + EXISTS), so RLS
-- policies and the lock/unlock function can use it safely.
CREATE OR REPLACE FUNCTION public.user_has_region_access(p_branch_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.branches b ON b.region_id = p.region_id
    WHERE p.id = auth.uid()
      AND p.role = 'region_admin'
      AND b.id = p_branch_id
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- ── Update set_forecast_month_status ──────────────────────────────
-- Both branches of the role check now accept region_admin when the
-- branch belongs to their region. The rest of the function (existing-
-- completed short-circuit, UPSERT into forecast_month_status, and the
-- automatic INSERT into forecast_month_status_history) is unchanged.
CREATE OR REPLACE FUNCTION public.set_forecast_month_status(
  p_branch_id UUID,
  p_year INTEGER,
  p_month INTEGER,
  p_completed BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_completed BOOLEAN := FALSE;
  v_role TEXT := public.get_user_role();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Month must be between 1 and 12';
  END IF;

  IF p_completed THEN
    IF NOT (
      v_role = 'hq_admin' OR
      (v_role = 'branch_user'  AND public.user_has_branch_access(p_branch_id)) OR
      (v_role = 'region_admin' AND public.user_has_region_access(p_branch_id))
    ) THEN
      RAISE EXCEPTION 'Only assigned branch users, region admins (own region), or HQ admins can complete forecast months';
    END IF;
  ELSE
    IF NOT (
      v_role = 'hq_admin' OR
      (v_role = 'region_admin' AND public.user_has_region_access(p_branch_id))
    ) THEN
      RAISE EXCEPTION 'Only HQ admins or region admins (own region) can unlock completed forecast months';
    END IF;
  END IF;

  SELECT COALESCE(is_completed, FALSE)
  INTO v_existing_completed
  FROM public.forecast_month_status
  WHERE branch_id = p_branch_id
    AND year = p_year
    AND month = p_month;

  IF v_existing_completed = p_completed THEN
    RETURN;
  END IF;

  IF p_completed THEN
    INSERT INTO public.forecast_month_status (
      branch_id,
      year,
      month,
      is_completed,
      completed_at,
      completed_by,
      created_at,
      updated_at
    )
    VALUES (
      p_branch_id,
      p_year,
      p_month,
      TRUE,
      NOW(),
      auth.uid(),
      NOW(),
      NOW()
    )
    ON CONFLICT (branch_id, year, month) DO UPDATE SET
      is_completed = TRUE,
      completed_at = NOW(),
      completed_by = auth.uid(),
      updated_at = NOW();

    INSERT INTO public.forecast_month_status_history (
      branch_id,
      year,
      month,
      event_type,
      actor_user_id,
      note
    )
    VALUES (
      p_branch_id,
      p_year,
      p_month,
      'completed',
      auth.uid(),
      p_note
    );
  ELSE
    INSERT INTO public.forecast_month_status (
      branch_id,
      year,
      month,
      is_completed,
      unlocked_at,
      unlocked_by,
      created_at,
      updated_at
    )
    VALUES (
      p_branch_id,
      p_year,
      p_month,
      FALSE,
      NOW(),
      auth.uid(),
      NOW(),
      NOW()
    )
    ON CONFLICT (branch_id, year, month) DO UPDATE SET
      is_completed = FALSE,
      unlocked_at = NOW(),
      unlocked_by = auth.uid(),
      updated_at = NOW();

    INSERT INTO public.forecast_month_status_history (
      branch_id,
      year,
      month,
      event_type,
      actor_user_id,
      note
    )
    VALUES (
      p_branch_id,
      p_year,
      p_month,
      'unlocked',
      auth.uid(),
      p_note
    );
  END IF;
END;
$$;

-- ── Grants + PostgREST reload ─────────────────────────────────────
-- (The original 018 migration already grants EXECUTE on
--  set_forecast_month_status; re-granting is a no-op and keeps this
--  migration self-contained if someone runs it on a clean DB.)
GRANT EXECUTE ON FUNCTION public.user_has_region_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_forecast_month_status(UUID, INTEGER, INTEGER, BOOLEAN, TEXT) TO authenticated;
NOTIFY pgrst, 'reload schema';
