-- Pending invites: when HQ creates an account with a role (HQ Admin / Region Admin),
-- we store it here. When the invited user signs in, handle_new_user applies it to their profile.

CREATE TABLE IF NOT EXISTS public.pending_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('hq_admin', 'region_admin')),
  region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- Allow service role (API) and trigger (SECURITY DEFINER) to use the table
CREATE POLICY "pending_invites_all" ON public.pending_invites
  FOR ALL USING (true) WITH CHECK (true);

-- Update trigger: when a new auth user is created, apply pending_invites if their email matches
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_role TEXT;
  p_region_id UUID;
  p_branch_id UUID;
BEGIN
  SELECT role, region_id, branch_id INTO p_role, p_region_id, p_branch_id
  FROM public.pending_invites
  WHERE email = LOWER(TRIM(NEW.email))
  LIMIT 1;

  INSERT INTO public.profiles (id, email, full_name, role, region_id, branch_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL),
    COALESCE(p_role, COALESCE(NEW.raw_user_meta_data ->> 'role', 'branch_user')),
    p_region_id,
    p_branch_id
  )
  ON CONFLICT (id) DO UPDATE SET
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    region_id = COALESCE(EXCLUDED.region_id, public.profiles.region_id),
    branch_id = COALESCE(EXCLUDED.branch_id, public.profiles.branch_id);

  DELETE FROM public.pending_invites WHERE email = LOWER(TRIM(NEW.email));

  RETURN NEW;
END;
$$;
