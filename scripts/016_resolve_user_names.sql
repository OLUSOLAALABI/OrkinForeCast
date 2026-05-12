-- Returns display names for a list of user IDs.
-- Uses SECURITY DEFINER so any authenticated user can resolve names
-- (e.g. branch users viewing audit log entries made by HQ admins).
-- Only exposes id + display name — no sensitive data.

CREATE OR REPLACE FUNCTION public.resolve_user_names(user_ids UUID[])
RETURNS TABLE (id UUID, display_name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, COALESCE(p.full_name, p.email, 'Unknown') AS display_name
  FROM public.profiles p
  WHERE p.id = ANY(user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.resolve_user_names(UUID[]) TO authenticated;
