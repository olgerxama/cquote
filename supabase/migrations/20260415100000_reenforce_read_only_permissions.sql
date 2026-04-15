-- Re-enforce read-only restrictions for firm members.
-- Idempotent policy refresh in case previous migrations were skipped or drifted.

CREATE OR REPLACE FUNCTION public.is_firm_admin(_user_id uuid, _firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.firm_users fu
    WHERE fu.user_id = _user_id
      AND fu.firm_id = _firm_id
      AND fu.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.firms f
    WHERE f.id = _firm_id
      AND f.owner_user_id = _user_id
  )
  OR public.has_role(_user_id, 'platform_owner');
$$;

-- firm_users mutations: admin only
DROP POLICY IF EXISTS firm_users_insert ON public.firm_users;
CREATE POLICY firm_users_insert ON public.firm_users
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS firm_users_update ON public.firm_users;
CREATE POLICY firm_users_update ON public.firm_users
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)))
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS firm_users_delete ON public.firm_users;
CREATE POLICY firm_users_delete ON public.firm_users
  FOR DELETE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

-- firms updates: admin only
DROP POLICY IF EXISTS firms_update ON public.firms;
CREATE POLICY firms_update ON public.firms
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), id)))
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), id)));

-- pricing tables: admin only mutations
DROP POLICY IF EXISTS pricing_bands_insert ON public.pricing_bands;
CREATE POLICY pricing_bands_insert ON public.pricing_bands
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS pricing_bands_update ON public.pricing_bands;
CREATE POLICY pricing_bands_update ON public.pricing_bands
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)))
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS pricing_bands_delete ON public.pricing_bands;
CREATE POLICY pricing_bands_delete ON public.pricing_bands
  FOR DELETE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS pricing_extras_insert ON public.pricing_extras;
CREATE POLICY pricing_extras_insert ON public.pricing_extras
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS pricing_extras_update ON public.pricing_extras;
CREATE POLICY pricing_extras_update ON public.pricing_extras
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)))
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS pricing_extras_delete ON public.pricing_extras;
CREATE POLICY pricing_extras_delete ON public.pricing_extras
  FOR DELETE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

-- leads/quotes mutations: admin only
DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)))
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS quotes_insert ON public.quotes;
CREATE POLICY quotes_insert ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS quotes_update ON public.quotes;
CREATE POLICY quotes_update ON public.quotes
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)))
  WITH CHECK ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS quotes_delete ON public.quotes;
CREATE POLICY quotes_delete ON public.quotes
  FOR DELETE TO authenticated
  USING ((SELECT public.is_firm_admin((SELECT auth.uid()), firm_id)));

DROP POLICY IF EXISTS quote_items_insert ON public.quote_items;
CREATE POLICY quote_items_insert ON public.quote_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
        AND (SELECT public.is_firm_admin((SELECT auth.uid()), q.firm_id))
    )
  );

DROP POLICY IF EXISTS quote_items_update ON public.quote_items;
CREATE POLICY quote_items_update ON public.quote_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
        AND (SELECT public.is_firm_admin((SELECT auth.uid()), q.firm_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
        AND (SELECT public.is_firm_admin((SELECT auth.uid()), q.firm_id))
    )
  );

DROP POLICY IF EXISTS quote_items_delete ON public.quote_items;
CREATE POLICY quote_items_delete ON public.quote_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
        AND (SELECT public.is_firm_admin((SELECT auth.uid()), q.firm_id))
    )
  );
