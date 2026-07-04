-- Merged handle_new_user: supports both invited users (pending_invites) and self sign-up (raw_user_meta_data).
-- Invited users get role/region/branch from pending_invites.
-- Self sign-up users get role/region/branch from raw_user_meta_data.
-- Run after 004_pending_invites.sql and 008_pending_invites_branch_user.sql.

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
  v_role TEXT;
  v_region_id UUID;
  v_branch_id UUID;
BEGIN
  -- Check pending_invites first (invited users)
  SELECT role, region_id, branch_id INTO p_role, p_region_id, p_branch_id
  FROM public.pending_invites
  WHERE email = LOWER(TRIM(NEW.email))
  LIMIT 1;

  IF p_role IS NOT NULL THEN
    -- Invited user: use pending_invites
    v_role := p_role;
    v_region_id := p_region_id;
    v_branch_id := p_branch_id;
    DELETE FROM public.pending_invites WHERE email = LOWER(TRIM(NEW.email));
  ELSE
    -- Self sign-up: use raw_user_meta_data
    v_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'branch_user');
    v_region_id := NULL;
    v_branch_id := NULL;
    IF NEW.raw_user_meta_data ->> 'region_id' IS NOT NULL AND (NEW.raw_user_meta_data ->> 'region_id') != '' THEN
      v_region_id := (NEW.raw_user_meta_data ->> 'region_id')::uuid;
    END IF;
    IF NEW.raw_user_meta_data ->> 'branch_id' IS NOT NULL AND (NEW.raw_user_meta_data ->> 'branch_id') != '' THEN
      v_branch_id := (NEW.raw_user_meta_data ->> 'branch_id')::uuid;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, region_id, branch_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL),
    v_role,
    v_region_id,
    v_branch_id
  )
  ON CONFLICT (id) DO UPDATE SET
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    region_id = COALESCE(EXCLUDED.region_id, public.profiles.region_id),
    branch_id = COALESCE(EXCLUDED.branch_id, public.profiles.branch_id);

  IF v_branch_id IS NOT NULL THEN
    INSERT INTO public.user_branch_access (user_id, branch_id)
    VALUES (NEW.id, v_branch_id)
    ON CONFLICT (user_id, branch_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
