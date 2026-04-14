-- Team roles and invitations support
-- Adds explicit read_only/admin member roles and tightens write policies so
-- read_only can view but cannot mutate firm data.

-- 1) Role hygiene
UPDATE firm_users SET role = 'admin' WHERE role IS NULL OR role NOT IN ('admin', 'read_only');

ALTER TABLE firm_users
  ALTER COLUMN role SET DEFAULT 'admin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'firm_users_role_check'
      AND conrelid = 'firm_users'::regclass
  ) THEN
    ALTER TABLE firm_users
      ADD CONSTRAINT firm_users_role_check
      CHECK (role IN ('admin', 'read_only'));
  END IF;
END $$;

-- 2) Helper for admin capability checks (security definer + fixed search_path)
CREATE OR REPLACE FUNCTION is_firm_admin(_user_id uuid, _firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM firm_users fu
    WHERE fu.user_id = _user_id
      AND fu.firm_id = _firm_id
      AND fu.role = 'admin'
  )
  OR EXISTS (
    SELECT 1
    FROM firms f
    WHERE f.id = _firm_id
      AND f.owner_user_id = _user_id
  )
  OR has_role(_user_id, 'platform_owner');
$$;

-- 3) firm_users policies: all firm members can view peers, only admins can mutate
DROP POLICY IF EXISTS firm_users_select ON firm_users;
CREATE POLICY firm_users_select ON firm_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM firm_users mine
      WHERE mine.user_id = (select auth.uid())
        AND mine.firm_id = firm_users.firm_id
    )
    OR (select has_role((select auth.uid()), 'platform_owner'))
  );

DROP POLICY IF EXISTS firm_users_insert ON firm_users;
CREATE POLICY firm_users_insert ON firm_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select is_firm_admin((select auth.uid()), firm_id))
    AND role IN ('admin', 'read_only')
  );

DROP POLICY IF EXISTS firm_users_update ON firm_users;
CREATE POLICY firm_users_update ON firm_users
  FOR UPDATE
  TO authenticated
  USING (
    (select is_firm_admin((select auth.uid()), firm_id))
    AND user_id <> (SELECT owner_user_id FROM firms WHERE id = firm_id)
  )
  WITH CHECK (
    (select is_firm_admin((select auth.uid()), firm_id))
    AND role IN ('admin', 'read_only')
    AND user_id <> (SELECT owner_user_id FROM firms WHERE id = firm_id)
  );

DROP POLICY IF EXISTS firm_users_delete ON firm_users;
CREATE POLICY firm_users_delete ON firm_users
  FOR DELETE
  TO authenticated
  USING (
    (select is_firm_admin((select auth.uid()), firm_id))
    AND user_id <> (SELECT owner_user_id FROM firms WHERE id = firm_id)
  );

-- 4) Mutating data policies now require admin capability
DROP POLICY IF EXISTS firms_update ON firms;
CREATE POLICY firms_update ON firms
  FOR UPDATE
  TO authenticated
  USING ((select is_firm_admin((select auth.uid()), id)))
  WITH CHECK ((select is_firm_admin((select auth.uid()), id)));

DROP POLICY IF EXISTS pricing_bands_insert ON pricing_bands;
CREATE POLICY pricing_bands_insert ON pricing_bands
  FOR INSERT TO authenticated
  WITH CHECK ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS pricing_bands_update ON pricing_bands;
CREATE POLICY pricing_bands_update ON pricing_bands
  FOR UPDATE TO authenticated
  USING ((select is_firm_admin((select auth.uid()), firm_id)))
  WITH CHECK ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS pricing_bands_delete ON pricing_bands;
CREATE POLICY pricing_bands_delete ON pricing_bands
  FOR DELETE TO authenticated
  USING ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS pricing_extras_insert ON pricing_extras;
CREATE POLICY pricing_extras_insert ON pricing_extras
  FOR INSERT TO authenticated
  WITH CHECK ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS pricing_extras_update ON pricing_extras;
CREATE POLICY pricing_extras_update ON pricing_extras
  FOR UPDATE TO authenticated
  USING ((select is_firm_admin((select auth.uid()), firm_id)))
  WITH CHECK ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS pricing_extras_delete ON pricing_extras;
CREATE POLICY pricing_extras_delete ON pricing_extras
  FOR DELETE TO authenticated
  USING ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS leads_update ON leads;
CREATE POLICY leads_update ON leads
  FOR UPDATE TO authenticated
  USING ((select is_firm_admin((select auth.uid()), firm_id)))
  WITH CHECK ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS quotes_insert ON quotes;
CREATE POLICY quotes_insert ON quotes
  FOR INSERT TO authenticated
  WITH CHECK ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS quotes_update ON quotes;
CREATE POLICY quotes_update ON quotes
  FOR UPDATE TO authenticated
  USING ((select is_firm_admin((select auth.uid()), firm_id)))
  WITH CHECK ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS quotes_delete ON quotes;
CREATE POLICY quotes_delete ON quotes
  FOR DELETE TO authenticated
  USING ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS quote_items_insert ON quote_items;
CREATE POLICY quote_items_insert ON quote_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_items.quote_id
        AND (select is_firm_admin((select auth.uid()), q.firm_id))
    )
  );

DROP POLICY IF EXISTS quote_items_update ON quote_items;
CREATE POLICY quote_items_update ON quote_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_items.quote_id
        AND (select is_firm_admin((select auth.uid()), q.firm_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_items.quote_id
        AND (select is_firm_admin((select auth.uid()), q.firm_id))
    )
  );

DROP POLICY IF EXISTS quote_items_delete ON quote_items;
CREATE POLICY quote_items_delete ON quote_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_items.quote_id
        AND (select is_firm_admin((select auth.uid()), q.firm_id))
    )
  );

DROP POLICY IF EXISTS discount_codes_insert ON discount_codes;
CREATE POLICY discount_codes_insert ON discount_codes
  FOR INSERT TO authenticated
  WITH CHECK ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS discount_codes_update ON discount_codes;
CREATE POLICY discount_codes_update ON discount_codes
  FOR UPDATE TO authenticated
  USING ((select is_firm_admin((select auth.uid()), firm_id)))
  WITH CHECK ((select is_firm_admin((select auth.uid()), firm_id)));

DROP POLICY IF EXISTS discount_codes_delete ON discount_codes;
CREATE POLICY discount_codes_delete ON discount_codes
  FOR DELETE TO authenticated
  USING ((select is_firm_admin((select auth.uid()), firm_id)));
