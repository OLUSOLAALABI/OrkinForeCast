-- Orkin Forecasting System Database Schema
-- This schema supports a hierarchical role-based access system:
-- HQ Admin > Region Admin > Branch User

-- Regions table
CREATE TABLE IF NOT EXISTS public.regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Branches table
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  region_id UUID NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User profiles with role-based access
-- Roles: 'hq_admin', 'region_admin', 'branch_user'
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'branch_user' CHECK (role IN ('hq_admin', 'region_admin', 'branch_user')),
  region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Explicit branch assignments for branch-level users.
-- profiles.branch_id is kept as the primary/default branch for compatibility.
CREATE TABLE IF NOT EXISTS public.user_branch_access (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, branch_id)
);

-- Upload history table
CREATE TABLE IF NOT EXISTS public.uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  year INTEGER NOT NULL,
  upload_type TEXT NOT NULL CHECK (upload_type IN ('actuals', 'budget')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Actuals data table (extracted from Excel uploads)
CREATE TABLE IF NOT EXISTS public.actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID REFERENCES public.uploads(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, description, year, month)
);

-- Forecasts table
CREATE TABLE IF NOT EXISTS public.forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  forecast_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  budget_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  last_month_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  last_year_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, description, year, month)
);

-- Branch-level monthly forecast completion state.
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

-- Event log for forecast completion workflow actions.
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

-- Enable Row Level Security on all tables
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_month_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_month_status_history ENABLE ROW LEVEL SECURITY;

-- Helper function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to get user region
CREATE OR REPLACE FUNCTION public.get_user_region_id()
RETURNS UUID AS $$
  SELECT region_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- Helper function to get user branch
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

-- Helper function to get all branch ids assigned to the current user
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

-- RLS Policies for regions
-- Everyone can view regions
CREATE POLICY "regions_select_all" ON public.regions FOR SELECT USING (true);
-- Only HQ admin can modify regions
CREATE POLICY "regions_insert_hq" ON public.regions FOR INSERT WITH CHECK (public.get_user_role() = 'hq_admin');
CREATE POLICY "regions_update_hq" ON public.regions FOR UPDATE USING (public.get_user_role() = 'hq_admin');
CREATE POLICY "regions_delete_hq" ON public.regions FOR DELETE USING (public.get_user_role() = 'hq_admin');

-- RLS Policies for branches
-- HQ admin sees all, region admin sees their region's branches, branch user sees their branch
-- Anonymous users (e.g. on sign-up page) can read all branches to choose region/branch
CREATE POLICY "branches_select" ON public.branches FOR SELECT USING (
  auth.uid() IS NULL OR
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND region_id = public.get_user_region_id()) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(id))
);
CREATE POLICY "branches_insert_hq" ON public.branches FOR INSERT WITH CHECK (public.get_user_role() = 'hq_admin');
CREATE POLICY "branches_update_hq" ON public.branches FOR UPDATE USING (public.get_user_role() = 'hq_admin');
CREATE POLICY "branches_delete_hq" ON public.branches FOR DELETE USING (public.get_user_role() = 'hq_admin');

CREATE POLICY "user_branch_access_select_self_or_hq" ON public.user_branch_access FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.get_user_role() = 'hq_admin'
);
CREATE POLICY "user_branch_access_manage_hq" ON public.user_branch_access FOR ALL TO authenticated USING (
  public.get_user_role() = 'hq_admin'
) WITH CHECK (
  public.get_user_role() = 'hq_admin'
);

CREATE POLICY "forecast_month_status_select" ON public.forecast_month_status FOR SELECT TO authenticated USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

CREATE POLICY "forecast_month_status_history_select" ON public.forecast_month_status_history FOR SELECT TO authenticated USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);

GRANT ALL ON public.user_branch_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_access(UUID, TEXT, UUID, UUID[]) TO authenticated;
GRANT SELECT ON public.forecast_month_status TO authenticated;
GRANT SELECT ON public.forecast_month_status_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_forecast_month_completed(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_forecast_month_status(UUID, INTEGER, INTEGER, BOOLEAN, TEXT) TO authenticated;

-- RLS Policies for profiles
-- Users can view their own profile, HQ admin can view all, region admin can view their region
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (
  id = auth.uid() OR
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND region_id = public.get_user_region_id())
);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_update_hq" ON public.profiles FOR UPDATE USING (public.get_user_role() = 'hq_admin');

-- RLS Policies for uploads
CREATE POLICY "uploads_select" ON public.uploads FOR SELECT USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);
CREATE POLICY "uploads_insert" ON public.uploads FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (
    public.get_user_role() = 'hq_admin' OR
    (public.get_user_role() = 'region_admin' AND branch_id IN (
      SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
    )) OR
    (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
  )
);
CREATE POLICY "uploads_delete" ON public.uploads FOR DELETE USING (
  user_id = auth.uid() OR public.get_user_role() = 'hq_admin'
);

-- RLS Policies for actuals
CREATE POLICY "actuals_select" ON public.actuals FOR SELECT USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);
CREATE POLICY "actuals_insert" ON public.actuals FOR INSERT WITH CHECK (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);
CREATE POLICY "actuals_update" ON public.actuals FOR UPDATE USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);
CREATE POLICY "actuals_delete" ON public.actuals FOR DELETE USING (
  public.get_user_role() = 'hq_admin'
);

-- RLS Policies for forecasts
CREATE POLICY "forecasts_select" ON public.forecasts FOR SELECT USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);
CREATE POLICY "forecasts_insert" ON public.forecasts FOR INSERT WITH CHECK (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);
CREATE POLICY "forecasts_update" ON public.forecasts FOR UPDATE USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND public.user_has_branch_access(branch_id))
);
CREATE POLICY "forecasts_delete" ON public.forecasts FOR DELETE USING (
  public.get_user_role() = 'hq_admin'
);

-- Trigger to auto-create profile on signup (includes region_id/branch_id from sign-up metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_region_id UUID;
  v_branch_id UUID;
BEGIN
  v_region_id := NULL;
  v_branch_id := NULL;
  IF NEW.raw_user_meta_data ->> 'region_id' IS NOT NULL AND (NEW.raw_user_meta_data ->> 'region_id') != '' THEN
    v_region_id := (NEW.raw_user_meta_data ->> 'region_id')::uuid;
  END IF;
  IF NEW.raw_user_meta_data ->> 'branch_id' IS NOT NULL AND (NEW.raw_user_meta_data ->> 'branch_id') != '' THEN
    v_branch_id := (NEW.raw_user_meta_data ->> 'branch_id')::uuid;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, region_id, branch_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'branch_user'),
    v_region_id,
    v_branch_id
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_branch_id IS NOT NULL THEN
    INSERT INTO public.user_branch_access (user_id, branch_id)
    VALUES (NEW.id, v_branch_id)
    ON CONFLICT (user_id, branch_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS prevent_completed_forecast_updates ON public.forecasts;
CREATE TRIGGER prevent_completed_forecast_updates
  BEFORE UPDATE ON public.forecasts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_completed_forecast_updates();

-- Insert default regions (7 regions; GVR added, branches redistributed)
INSERT INTO public.regions (name) VALUES
  ('PACIFIC REGION'),
  ('GVR REGION'),
  ('PRAIRIE REGION'),
  ('ONTARIO REGION'),
  ('GTA REGION'),
  ('QUEBEC REGION'),
  ('ATLANTIC REGION')
ON CONFLICT (name) DO NOTHING;

-- Insert operational branches only (49 branches; excludes functional/corporate OH, CC, QA, SALES, TTL)
-- Pacific Region (7)
INSERT INTO public.branches (name, code, region_id) 
SELECT t.branch_name, t.branch_code, r.id FROM (VALUES
  ('25 WESTSIDE', '025'),
  ('26 BC INT C', '026'),
  ('27 BC INT N', '027'),
  ('28 ATLAS', '028'),
  ('29 VPC', '029'),
  ('32 BC INT S', '032'),
  ('34 VCR ISLAND', '034')
) AS t(branch_name, branch_code), public.regions r WHERE r.name = 'PACIFIC REGION'
ON CONFLICT (code) DO NOTHING;

-- GVR Region (4) — branches moved from Pacific
INSERT INTO public.branches (name, code, region_id) 
SELECT t.branch_name, t.branch_code, r.id FROM (VALUES
  ('30 RICHMOND', '030'),
  ('31 VCR', '031'),
  ('33 VALLEY', '033'),
  ('36 BURNABY', '036')
) AS t(branch_name, branch_code), public.regions r WHERE r.name = 'GVR REGION'
ON CONFLICT (code) DO NOTHING;

-- Prairie Region (9)
INSERT INTO public.branches (name, code, region_id) 
SELECT t.branch_name, t.branch_code, r.id FROM (VALUES
  ('37 EDM S', '037'),
  ('46 EDM N', '046'),
  ('38 CAL S', '038'),
  ('39 SASK', '039'),
  ('40 CAL N', '040'),
  ('41 CAL RES', '041'),
  ('43 PRA FUM', '043'),
  ('44 MANITOBA', '044'),
  ('45 REGINA', '045')
) AS t(branch_name, branch_code), public.regions r WHERE r.name = 'PRAIRIE REGION'
ON CONFLICT (code) DO NOTHING;

-- Ontario Region (10)
INSERT INTO public.branches (name, code, region_id) 
SELECT t.branch_name, t.branch_code, r.id FROM (VALUES
  ('6 STONEY CR', '006'),
  ('8 NIAGARA FALLS', '008'),
  ('9 SUDBURY', '009'),
  ('10 SE ON', '010'),
  ('14 CAMBRIDGE', '014'),
  ('15 NORTH BAY', '015'),
  ('16 BARRIE', '016'),
  ('17 ON FUM', '017'),
  ('18 LONDON', '018'),
  ('19 WINDSOR', '019')
) AS t(branch_name, branch_code), public.regions r WHERE r.name = 'ONTARIO REGION'
ON CONFLICT (code) DO NOTHING;

-- GTA Region (8)
INSERT INTO public.branches (name, code, region_id) 
SELECT t.branch_name, t.branch_code, r.id FROM (VALUES
  ('1 TOR W', '001'),
  ('2 HI-RISE', '002'),
  ('3 TOR E', '003'),
  ('4 GTA RES', '004'),
  ('5 MISSISSAUGA', '005'),
  ('7 TOR N', '007'),
  ('11 BRAMPTON', '011'),
  ('12 DOWNTOWN', '012')
) AS t(branch_name, branch_code), public.regions r WHERE r.name = 'GTA REGION'
ON CONFLICT (code) DO NOTHING;

-- Quebec Region (6)
INSERT INTO public.branches (name, code, region_id) 
SELECT t.branch_name, t.branch_code, r.id FROM (VALUES
  ('50 S SHORE-MTL', '050'),
  ('51 N SHORE-QC CITY', '051'),
  ('53 OTT W', '053'),
  ('54 OTT E', '054'),
  ('56 REGIONEX', '056'),
  ('64 QC FUM', '064')
) AS t(branch_name, branch_code), public.regions r WHERE r.name = 'QUEBEC REGION'
ON CONFLICT (code) DO NOTHING;

-- Atlantic Region (5)
INSERT INTO public.branches (name, code, region_id) 
SELECT t.branch_name, t.branch_code, r.id FROM (VALUES
  ('60 PEI', '060'),
  ('61 NB', '061'),
  ('62 NS', '062'),
  ('63 NF LAB E', '063'),
  ('65 NF LAB W', '065')
) AS t(branch_name, branch_code), public.regions r WHERE r.name = 'ATLANTIC REGION'
ON CONFLICT (code) DO NOTHING;
