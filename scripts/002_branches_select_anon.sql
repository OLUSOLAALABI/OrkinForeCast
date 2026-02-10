-- Fix: Allow anonymous users to read branches (for sign-up branch dropdown).
-- Run this in Supabase SQL Editor if you already ran 001_create_schema.sql
-- and the sign-up page shows "No branches in this region".

DROP POLICY IF EXISTS "branches_select" ON public.branches;

CREATE POLICY "branches_select" ON public.branches FOR SELECT USING (
  auth.uid() IS NULL OR
  public.get_user_role() = 'hq_admin' OR
  (public.get_user_role() = 'region_admin' AND region_id = public.get_user_region_id()) OR
  (public.get_user_role() = 'branch_user' AND id = public.get_user_branch_id())
);
