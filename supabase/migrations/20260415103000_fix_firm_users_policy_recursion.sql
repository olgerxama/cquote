-- Fix infinite recursion in firm_users RLS policies by using SECURITY DEFINER
-- helpers with row_security disabled.

CREATE OR REPLACE FUNCTION public.is_firm_member(_user_id uuid, _firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.firm_users fu
    WHERE fu.user_id = _user_id
      AND fu.firm_id = _firm_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.firms f
    WHERE f.id = _firm_id
      AND f.owner_user_id = _user_id
  )
  OR public.has_role(_user_id, 'platform_owner');
$$;

CREATE OR REPLACE FUNCTION public.is_firm_admin(_user_id uuid, _firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.firm_users fu
    WHERE fu.user_id = _user_id
      AND fu.firm_id = _firm_id
      AND fu.role = 'admin'
  )
  OR EXISTS (
    SELECT 1
    FROM public.firms f
    WHERE f.id = _firm_id
      AND f.owner_user_id = _user_id
  )
  OR public.has_role(_user_id, 'platform_owner');
$$;

DROP POLICY IF EXISTS firm_users_select ON public.firm_users;
CREATE POLICY firm_users_select ON public.firm_users
  FOR SELECT TO authenticated
  USING ((SELECT public.is_firm_member((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS firm_users_insert ON public.firm_users;
CREATE POLICY firm_users_insert ON public.firm_users
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_firm_admin((SELECT auth.uid()), firm_id))
    AND role IN ('admin', 'read_only')
  );

DROP POLICY IF EXISTS firm_users_update ON public.firm_users;
CREATE POLICY firm_users_update ON public.firm_users
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_firm_admin((SELECT auth.uid()), firm_id))
    AND user_id <> (SELECT owner_user_id FROM public.firms WHERE id = firm_id)
  )
  WITH CHECK (
    (SELECT public.is_firm_admin((SELECT auth.uid()), firm_id))
    AND role IN ('admin', 'read_only')
    AND user_id <> (SELECT owner_user_id FROM public.firms WHERE id = firm_id)
  );

DROP POLICY IF EXISTS firm_users_delete ON public.firm_users;
CREATE POLICY firm_users_delete ON public.firm_users
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_firm_admin((SELECT auth.uid()), firm_id))
    AND user_id <> (SELECT owner_user_id FROM public.firms WHERE id = firm_id)
  );
