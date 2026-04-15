-- Security hardening for public.firm_user_invites
-- Supabase linter requires RLS on exposed tables.

ALTER TABLE public.firm_user_invites ENABLE ROW LEVEL SECURITY;

-- No direct client access; this table is managed via service-role edge functions.
DROP POLICY IF EXISTS firm_user_invites_no_client_access ON public.firm_user_invites;
CREATE POLICY firm_user_invites_no_client_access ON public.firm_user_invites
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
