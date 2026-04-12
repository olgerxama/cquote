-- Migration: fix security + performance advisor warnings
-- 1. Security: set search_path on update_updated_at_column
-- 2. Performance: wrap auth.uid() in subselects so Postgres evaluates once
-- 3. Performance: add missing FK indexes on firm_users and quotes

-- =========================================================================
-- 1. SECURITY: Fix "Function Search Path Mutable" on update_updated_at_column
-- =========================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- =========================================================================
-- 2. PERFORMANCE: Fix "Auth RLS Initialization Plan" warnings
--    Wrap auth.uid() in (select ...) so Postgres treats it as a constant
--    instead of re-evaluating for each row.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- firms
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS firms_update ON firms;
CREATE POLICY firms_update ON firms
    FOR UPDATE
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = id
        OR (select has_role((select auth.uid()), 'platform_owner'))
    )
    WITH CHECK (
        (select get_user_firm_id((select auth.uid()))) = id
        OR (select has_role((select auth.uid()), 'platform_owner'))
    );

DROP POLICY IF EXISTS firms_insert ON firms;
CREATE POLICY firms_insert ON firms
    FOR INSERT
    TO authenticated
    WITH CHECK (
        NOT EXISTS (
            SELECT 1 FROM firm_users WHERE user_id = (select auth.uid())
        )
    );

-- ---------------------------------------------------------------------------
-- firm_users
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS firm_users_select ON firm_users;
CREATE POLICY firm_users_select ON firm_users
    FOR SELECT
    TO authenticated
    USING (
        user_id = (select auth.uid())
        OR (select has_role((select auth.uid()), 'platform_owner'))
    );

DROP POLICY IF EXISTS firm_users_insert ON firm_users;
CREATE POLICY firm_users_insert ON firm_users
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = (select auth.uid())
        AND EXISTS (
            SELECT 1 FROM firms WHERE id = firm_id AND owner_user_id = (select auth.uid())
        )
    );

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS user_roles_select ON user_roles;
CREATE POLICY user_roles_select ON user_roles
    FOR SELECT
    TO authenticated
    USING (
        user_id = (select auth.uid())
        OR (select has_role((select auth.uid()), 'platform_owner'))
    );

-- ---------------------------------------------------------------------------
-- pricing_bands
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pricing_bands_select_auth ON pricing_bands;
CREATE POLICY pricing_bands_select_auth ON pricing_bands
    FOR SELECT
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
        OR (select has_role((select auth.uid()), 'platform_owner'))
    );

DROP POLICY IF EXISTS pricing_bands_insert ON pricing_bands;
CREATE POLICY pricing_bands_insert ON pricing_bands
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

DROP POLICY IF EXISTS pricing_bands_update ON pricing_bands;
CREATE POLICY pricing_bands_update ON pricing_bands
    FOR UPDATE
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    )
    WITH CHECK (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

DROP POLICY IF EXISTS pricing_bands_delete ON pricing_bands;
CREATE POLICY pricing_bands_delete ON pricing_bands
    FOR DELETE
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

-- ---------------------------------------------------------------------------
-- pricing_extras
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pricing_extras_select_auth ON pricing_extras;
CREATE POLICY pricing_extras_select_auth ON pricing_extras
    FOR SELECT
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
        OR (select has_role((select auth.uid()), 'platform_owner'))
    );

DROP POLICY IF EXISTS pricing_extras_insert ON pricing_extras;
CREATE POLICY pricing_extras_insert ON pricing_extras
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

DROP POLICY IF EXISTS pricing_extras_update ON pricing_extras;
CREATE POLICY pricing_extras_update ON pricing_extras
    FOR UPDATE
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    )
    WITH CHECK (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

DROP POLICY IF EXISTS pricing_extras_delete ON pricing_extras;
CREATE POLICY pricing_extras_delete ON pricing_extras
    FOR DELETE
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads
    FOR SELECT
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
        OR (select has_role((select auth.uid()), 'platform_owner'))
    );

DROP POLICY IF EXISTS leads_update ON leads;
CREATE POLICY leads_update ON leads
    FOR UPDATE
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    )
    WITH CHECK (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

-- ---------------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS quotes_select ON quotes;
CREATE POLICY quotes_select ON quotes
    FOR SELECT
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
        OR (select has_role((select auth.uid()), 'platform_owner'))
    );

DROP POLICY IF EXISTS quotes_insert ON quotes;
CREATE POLICY quotes_insert ON quotes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

DROP POLICY IF EXISTS quotes_update ON quotes;
CREATE POLICY quotes_update ON quotes
    FOR UPDATE
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    )
    WITH CHECK (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

DROP POLICY IF EXISTS quotes_delete ON quotes;
CREATE POLICY quotes_delete ON quotes
    FOR DELETE
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

-- ---------------------------------------------------------------------------
-- quote_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS quote_items_select ON quote_items;
CREATE POLICY quote_items_select ON quote_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM quotes
            WHERE quotes.id = quote_items.quote_id
              AND (
                  (select get_user_firm_id((select auth.uid()))) = quotes.firm_id
                  OR (select has_role((select auth.uid()), 'platform_owner'))
              )
        )
    );

DROP POLICY IF EXISTS quote_items_insert ON quote_items;
CREATE POLICY quote_items_insert ON quote_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM quotes
            WHERE quotes.id = quote_items.quote_id
              AND (select get_user_firm_id((select auth.uid()))) = quotes.firm_id
        )
    );

DROP POLICY IF EXISTS quote_items_update ON quote_items;
CREATE POLICY quote_items_update ON quote_items
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM quotes
            WHERE quotes.id = quote_items.quote_id
              AND (select get_user_firm_id((select auth.uid()))) = quotes.firm_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM quotes
            WHERE quotes.id = quote_items.quote_id
              AND (select get_user_firm_id((select auth.uid()))) = quotes.firm_id
        )
    );

DROP POLICY IF EXISTS quote_items_delete ON quote_items;
CREATE POLICY quote_items_delete ON quote_items
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM quotes
            WHERE quotes.id = quote_items.quote_id
              AND (select get_user_firm_id((select auth.uid()))) = quotes.firm_id
        )
    );

-- ---------------------------------------------------------------------------
-- discount_codes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS discount_codes_select_auth ON discount_codes;
CREATE POLICY discount_codes_select_auth ON discount_codes
    FOR SELECT
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
        OR (select has_role((select auth.uid()), 'platform_owner'))
    );

DROP POLICY IF EXISTS discount_codes_insert ON discount_codes;
CREATE POLICY discount_codes_insert ON discount_codes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

DROP POLICY IF EXISTS discount_codes_update ON discount_codes;
CREATE POLICY discount_codes_update ON discount_codes
    FOR UPDATE
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    )
    WITH CHECK (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

DROP POLICY IF EXISTS discount_codes_delete ON discount_codes;
CREATE POLICY discount_codes_delete ON discount_codes
    FOR DELETE
    TO authenticated
    USING (
        (select get_user_firm_id((select auth.uid()))) = firm_id
    );

-- =========================================================================
-- 3. PERFORMANCE: Add missing FK indexes
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_firm_users_user_id ON firm_users (user_id);
CREATE INDEX IF NOT EXISTS idx_firm_users_firm_id ON firm_users (firm_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created_by  ON quotes (created_by);
