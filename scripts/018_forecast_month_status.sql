-- Forecast completion verification workflow.
-- Adds branch-level month completion state, visible verification history,
-- and a lock that blocks forecast edits until HQ unlocks the month.

CREATE TABLE IF NOT EXISTS public.forecast_month_status (
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  unlocked_at TIMESTAMPTZ,
  unlocked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (branch_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_forecast_month_status_year_month
  ON public.forecast_month_status(year, month, is_completed);

CREATE TABLE IF NOT EXISTS public.forecast_month_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  event_type TEXT NOT NULL CHECK (event_type IN ('completed', 'unlocked')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecast_month_status_history_branch
  ON public.forecast_month_status_history(branch_id, year, month, created_at DESC);

ALTER TABLE public.forecast_month_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_month_status_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_forecast_month_completed(
  p_branch_id UUID,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.forecast_month_status
    WHERE branch_id = p_branch_id
      AND year = p_year
      AND month = p_month
      AND is_completed = TRUE
  );
$$ LANGUAGE SQL SECURITY DEFINER;

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
      (v_role = 'branch_user' AND public.user_has_branch_access(p_branch_id))
    ) THEN
      RAISE EXCEPTION 'Only assigned branch users or HQ admins can complete forecast months';
    END IF;
  ELSE
    IF v_role <> 'hq_admin' THEN
      RAISE EXCEPTION 'Only HQ admins can unlock completed forecast months';
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

CREATE OR REPLACE FUNCTION public.prevent_completed_forecast_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_forecast_month_completed(
    COALESCE(NEW.branch_id, OLD.branch_id),
    COALESCE(NEW.year, OLD.year),
    COALESCE(NEW.month, OLD.month)
  ) THEN
    RAISE EXCEPTION 'This month has been marked forecasted and is locked until HQ unlocks it for rework.';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "forecast_month_status_select" ON public.forecast_month_status;
CREATE POLICY "forecast_month_status_select" ON public.forecast_month_status FOR SELECT TO authenticated USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

DROP POLICY IF EXISTS "forecast_month_status_history_select" ON public.forecast_month_status_history;
CREATE POLICY "forecast_month_status_history_select" ON public.forecast_month_status_history FOR SELECT TO authenticated USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

GRANT SELECT ON public.forecast_month_status TO authenticated;
GRANT SELECT ON public.forecast_month_status_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_forecast_month_completed(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_forecast_month_status(UUID, INTEGER, INTEGER, BOOLEAN, TEXT) TO authenticated;

DROP TRIGGER IF EXISTS prevent_completed_forecast_updates ON public.forecasts;
CREATE TRIGGER prevent_completed_forecast_updates
  BEFORE UPDATE ON public.forecasts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_completed_forecast_updates();

NOTIFY pgrst, 'reload schema';