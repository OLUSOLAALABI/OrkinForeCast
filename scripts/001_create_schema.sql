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

-- Enable Row Level Security on all tables
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;

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
  SELECT branch_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

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
  (public.get_user_role() = 'branch_user' AND id = public.get_user_branch_id())
);
CREATE POLICY "branches_insert_hq" ON public.branches FOR INSERT WITH CHECK (public.get_user_role() = 'hq_admin');
CREATE POLICY "branches_update_hq" ON public.branches FOR UPDATE USING (public.get_user_role() = 'hq_admin');
CREATE POLICY "branches_delete_hq" ON public.branches FOR DELETE USING (public.get_user_role() = 'hq_admin');

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
  (public.get_user_role() = 'branch_user' AND branch_id = public.get_user_branch_id())
);
CREATE POLICY "uploads_insert" ON public.uploads FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (
    public.get_user_role() = 'hq_admin' OR
    (public.get_user_role() = 'region_admin' AND branch_id IN (
      SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
    )) OR
    (public.get_user_role() = 'branch_user' AND branch_id = public.get_user_branch_id())
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
  (public.get_user_role() = 'branch_user' AND branch_id = public.get_user_branch_id())
);
CREATE POLICY "actuals_insert" ON public.actuals FOR INSERT WITH CHECK (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND branch_id = public.get_user_branch_id())
);
CREATE POLICY "actuals_update" ON public.actuals FOR UPDATE USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND branch_id = public.get_user_branch_id())
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
  (public.get_user_role() = 'branch_user' AND branch_id = public.get_user_branch_id())
);
CREATE POLICY "forecasts_insert" ON public.forecasts FOR INSERT WITH CHECK (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND branch_id = public.get_user_branch_id())
);
CREATE POLICY "forecasts_update" ON public.forecasts FOR UPDATE USING (
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND branch_id IN (
    SELECT id FROM public.branches WHERE region_id = public.get_user_region_id()
  )) OR
  (public.get_user_role() = 'branch_user' AND branch_id = public.get_user_branch_id())
);
CREATE POLICY "forecasts_delete" ON public.forecasts FOR DELETE USING (
  public.get_user_role() = 'hq_admin'
);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'branch_user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Insert default regions (from the Python script)
INSERT INTO public.regions (name) VALUES
  ('PACIFIC REGION'),
  ('PRAIRIE REGION'),
  ('ONTARIO REGION'),
  ('GTA REGION'),
  ('QUEBEC REGION'),
  ('ATLANTIC REGION')
ON CONFLICT (name) DO NOTHING;

-- Insert operational branches only (49 branches; excludes functional/corporate OH, CC, QA, SALES, TTL)
-- Pacific Region (11)
INSERT INTO public.branches (name, code, region_id) 
SELECT t.branch_name, t.branch_code, r.id FROM (VALUES
  ('25 WESTSIDE', '025'),
  ('26 BC INT C', '026'),
  ('27 BC INT N', '027'),
  ('28 ATLAS', '028'),
  ('29 VPC', '029'),
  ('30 RICHMOND', '030'),
  ('31 VCR', '031'),
  ('32 BC INT S', '032'),
  ('33 VALLEY', '033'),
  ('34 VCR ISLAND', '034'),
  ('36 BURNABY', '036')
) AS t(branch_name, branch_code), public.regions r WHERE r.name = 'PACIFIC REGION'
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
