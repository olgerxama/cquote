-- =============================================================================
-- Initial Schema Migration for Conveyancing Quote Platform
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Custom Types
-- ---------------------------------------------------------------------------
CREATE TYPE app_role AS ENUM ('admin', 'platform_owner');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- 1. firms - Firm tenant root
CREATE TABLE firms (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        text NOT NULL,
    slug                        text NOT NULL UNIQUE,
    logo_url                    text,
    primary_color               text DEFAULT '#1e3a5f',
    disclaimer_text             text DEFAULT 'This is an estimate...',
    created_at                  timestamptz DEFAULT now(),
    updated_at                  timestamptz DEFAULT now(),
    plan_type                   text NOT NULL DEFAULT 'free'
                                    CHECK (plan_type IN ('free', 'professional')),
    show_instant_quote          boolean DEFAULT false,
    show_estimate_document      boolean DEFAULT false,
    require_admin_review        boolean DEFAULT true,
    public_quote_form_enabled   boolean DEFAULT true,
    is_active                   boolean DEFAULT true,
    admin_notes                 text,
    disclaimer_purchase         text,
    disclaimer_sale             text,
    disclaimer_remortgage       text,
    manual_review_conditions    jsonb DEFAULT '[]'::jsonb,
    reply_to_email              text,
    sender_display_name         text,
    owner_user_id               uuid REFERENCES auth.users(id),
    stripe_customer_id          text,
    stripe_subscription_id      text,
    stripe_subscription_status  text
                                    CHECK (
                                        stripe_subscription_status IS NULL
                                        OR stripe_subscription_status IN (
                                            'active','past_due','canceled','unpaid',
                                            'trialing','incomplete','incomplete_expired','paused'
                                        )
                                    ),
    public_form_config          jsonb NOT NULL DEFAULT '{
        "show_service_selector": true,
        "show_sale_section": true,
        "show_purchase_section": true,
        "show_remortgage_section": true,
        "show_additional_info": true,
        "show_timeline_notes": true,
        "show_phone_field": true,
        "show_discount_code": true,
        "show_instruct_button": true,
        "hidden_fields": []
    }'::jsonb,
    auto_send_quote_emails      boolean DEFAULT false
);

-- 2. firm_users - User to firm mapping
CREATE TABLE firm_users (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    firm_id     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    role        text DEFAULT 'admin',
    created_at  timestamptz DEFAULT now(),
    UNIQUE (user_id, firm_id)
);

-- 3. user_roles - Global platform roles
CREATE TABLE user_roles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        app_role NOT NULL,
    created_at  timestamptz DEFAULT now(),
    UNIQUE (user_id, role)
);

-- 4. pricing_bands - Fee bands by service + property value range
CREATE TABLE pricing_bands (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    service_type    text NOT NULL
                        CHECK (service_type IN ('purchase','sale','sale_purchase','remortgage')),
    min_value       numeric DEFAULT 0,
    max_value       numeric DEFAULT 999999999,
    base_fee        numeric NOT NULL,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- 5. pricing_extras - Conditional and manual extras
CREATE TABLE pricing_extras (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name                text NOT NULL,
    condition_field     text,
    condition_value     text,
    amount              numeric NOT NULL,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now(),
    apply_mode          text DEFAULT 'automatic'
                            CHECK (apply_mode IN ('automatic','manual_optional')),
    vat_applicable      boolean DEFAULT true,
    is_active           boolean DEFAULT true,
    trigger_operator    text DEFAULT 'equals'
                            CHECK (trigger_operator IN ('equals','not_equals')),
    service_type        text
                            CHECK (
                                service_type IS NULL
                                OR service_type IN ('purchase','sale','sale_purchase','remortgage')
                            )
);

-- 6. discount_codes - Discount code system
CREATE TABLE discount_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    code            text NOT NULL,
    description     text,
    discount_type   text DEFAULT 'fixed'
                        CHECK (discount_type IN ('fixed','percentage')),
    discount_value  numeric NOT NULL,
    is_active       boolean DEFAULT true,
    valid_from      timestamptz,
    valid_until     timestamptz,
    max_uses        int,
    use_count       int DEFAULT 0,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    UNIQUE (firm_id, code)
);

-- 7. leads - Customer submissions
CREATE TABLE leads (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    full_name           text NOT NULL,
    email               text NOT NULL,
    phone               text,
    service_type        text NOT NULL,
    property_value      numeric NOT NULL,
    tenure              text NOT NULL,
    mortgage_required   boolean DEFAULT false,
    first_time_buyer    boolean DEFAULT false,
    estimated_total     numeric,
    status              text DEFAULT 'new'
                            CHECK (status IN ('new','review','quoted')),
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now(),
    answers             jsonb DEFAULT '{}'::jsonb,
    discount_code_id    uuid REFERENCES discount_codes(id),
    first_name          text,
    surname             text
);

-- 8. quotes - Quote metadata and totals
CREATE TABLE quotes (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id                 uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    status                  text DEFAULT 'draft'
                                CHECK (status IN ('new','draft','sent','accepted','expired')),
    subtotal                numeric DEFAULT 0,
    vat_total               numeric DEFAULT 0,
    grand_total             numeric DEFAULT 0,
    discount_total          numeric DEFAULT 0,
    created_by              uuid REFERENCES auth.users(id),
    created_at              timestamptz DEFAULT now(),
    updated_at              timestamptz DEFAULT now(),
    document_type           text
                                CHECK (
                                    document_type IS NULL
                                    OR document_type IN ('estimate','invoice')
                                ),
    sent_at                 timestamptz,
    document_generated_at   timestamptz,
    document_downloaded_at  timestamptz,
    reference_code          text
);

-- 9. quote_items - Itemized line items
CREATE TABLE quote_items (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id                uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    description             text NOT NULL,
    amount                  numeric NOT NULL,
    is_vatable              boolean DEFAULT true,
    sort_order              int DEFAULT 0,
    created_at              timestamptz DEFAULT now(),
    item_type               text DEFAULT 'fee'
                                CHECK (item_type IN ('fee','extra','disbursement','discount','manual')),
    source_type             text DEFAULT 'manual'
                                CHECK (source_type IN ('band','extra_auto','extra_manual','discount_code','manual')),
    source_reference_id     uuid,
    is_manual               boolean DEFAULT false,
    is_discount             boolean DEFAULT false
);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- 1. Trigger function: update_updated_at_column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. get_user_firm_id - Returns the firm_id for a given user
CREATE OR REPLACE FUNCTION get_user_firm_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT firm_id
    FROM firm_users
    WHERE user_id = _user_id
    LIMIT 1;
$$;

-- 3. has_role - Checks if a user has a specific global role
CREATE OR REPLACE FUNCTION has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_roles
        WHERE user_id = _user_id
          AND role = _role
    );
$$;

-- 4. increment_discount_use_count - Atomically increment and validate
CREATE OR REPLACE FUNCTION increment_discount_use_count(_discount_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _rec discount_codes%ROWTYPE;
BEGIN
    SELECT *
    INTO _rec
    FROM discount_codes
    WHERE id = _discount_code_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Discount code not found';
    END IF;

    IF _rec.is_active = false THEN
        RAISE EXCEPTION 'Discount code is not active';
    END IF;

    IF _rec.valid_from IS NOT NULL AND now() < _rec.valid_from THEN
        RAISE EXCEPTION 'Discount code is not yet valid';
    END IF;

    IF _rec.valid_until IS NOT NULL AND now() > _rec.valid_until THEN
        RAISE EXCEPTION 'Discount code has expired';
    END IF;

    IF _rec.max_uses IS NOT NULL AND _rec.use_count >= _rec.max_uses THEN
        RAISE EXCEPTION 'Discount code has reached maximum uses';
    END IF;

    UPDATE discount_codes
    SET use_count = use_count + 1
    WHERE id = _discount_code_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_firms_updated_at
    BEFORE UPDATE ON firms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_pricing_bands_updated_at
    BEFORE UPDATE ON pricing_bands
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_pricing_extras_updated_at
    BEFORE UPDATE ON pricing_extras
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_quotes_updated_at
    BEFORE UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_discount_codes_updated_at
    BEFORE UPDATE ON discount_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_firms_owner_user_id           ON firms (owner_user_id);
CREATE INDEX idx_firms_stripe_customer_id      ON firms (stripe_customer_id);
CREATE INDEX idx_firms_stripe_subscription_id  ON firms (stripe_subscription_id);
CREATE INDEX idx_leads_firm_status             ON leads (firm_id, status);
CREATE INDEX idx_leads_discount_code_id        ON leads (discount_code_id);
CREATE INDEX idx_quotes_lead_id                ON quotes (lead_id);
CREATE INDEX idx_quotes_firm_id                ON quotes (firm_id);
CREATE INDEX idx_quote_items_quote_id          ON quote_items (quote_id);
CREATE INDEX idx_pricing_bands_firm_id         ON pricing_bands (firm_id);
CREATE INDEX idx_pricing_extras_firm_id        ON pricing_extras (firm_id);
CREATE INDEX idx_discount_codes_firm_id        ON discount_codes (firm_id);

CREATE UNIQUE INDEX idx_quotes_reference_code_unique
    ON quotes (reference_code)
    WHERE reference_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE firms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_bands   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_extras  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_codes  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS Policies: firms
-- ---------------------------------------------------------------------------

-- SELECT: publicly readable (for slug lookups, public quote forms, etc.)
CREATE POLICY firms_select ON firms
    FOR SELECT
    USING (true);

-- UPDATE: firm member or platform owner
CREATE POLICY firms_update ON firms
    FOR UPDATE
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = id
        OR has_role(auth.uid(), 'platform_owner')
    )
    WITH CHECK (
        get_user_firm_id(auth.uid()) = id
        OR has_role(auth.uid(), 'platform_owner')
    );

-- INSERT: authenticated users who don't already belong to a firm
CREATE POLICY firms_insert ON firms
    FOR INSERT
    TO authenticated
    WITH CHECK (
        NOT EXISTS (
            SELECT 1 FROM firm_users WHERE user_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- RLS Policies: firm_users
-- ---------------------------------------------------------------------------

-- SELECT: own rows or platform owner
CREATE POLICY firm_users_select ON firm_users
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR has_role(auth.uid(), 'platform_owner')
    );

-- INSERT: authenticated, user_id must be self, and firm must be owned by self
CREATE POLICY firm_users_insert ON firm_users
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM firms WHERE id = firm_id AND owner_user_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- RLS Policies: user_roles
-- ---------------------------------------------------------------------------

-- SELECT: own rows or platform owner
CREATE POLICY user_roles_select ON user_roles
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR has_role(auth.uid(), 'platform_owner')
    );

-- ---------------------------------------------------------------------------
-- RLS Policies: pricing_bands
-- ---------------------------------------------------------------------------

-- SELECT (anon): active firms with public form enabled
CREATE POLICY pricing_bands_select_anon ON pricing_bands
    FOR SELECT
    TO anon
    USING (
        EXISTS (
            SELECT 1 FROM firms
            WHERE firms.id = pricing_bands.firm_id
              AND firms.is_active = true
              AND firms.public_quote_form_enabled = true
        )
    );

-- SELECT (authenticated): firm member or platform owner
CREATE POLICY pricing_bands_select_auth ON pricing_bands
    FOR SELECT
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
        OR has_role(auth.uid(), 'platform_owner')
    );

-- INSERT: firm member
CREATE POLICY pricing_bands_insert ON pricing_bands
    FOR INSERT
    TO authenticated
    WITH CHECK (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- UPDATE: firm member
CREATE POLICY pricing_bands_update ON pricing_bands
    FOR UPDATE
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
    )
    WITH CHECK (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- DELETE: firm member
CREATE POLICY pricing_bands_delete ON pricing_bands
    FOR DELETE
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- ---------------------------------------------------------------------------
-- RLS Policies: pricing_extras
-- ---------------------------------------------------------------------------

-- SELECT (anon): active firms with public form enabled
CREATE POLICY pricing_extras_select_anon ON pricing_extras
    FOR SELECT
    TO anon
    USING (
        EXISTS (
            SELECT 1 FROM firms
            WHERE firms.id = pricing_extras.firm_id
              AND firms.is_active = true
              AND firms.public_quote_form_enabled = true
        )
    );

-- SELECT (authenticated): firm member or platform owner
CREATE POLICY pricing_extras_select_auth ON pricing_extras
    FOR SELECT
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
        OR has_role(auth.uid(), 'platform_owner')
    );

-- INSERT: firm member
CREATE POLICY pricing_extras_insert ON pricing_extras
    FOR INSERT
    TO authenticated
    WITH CHECK (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- UPDATE: firm member
CREATE POLICY pricing_extras_update ON pricing_extras
    FOR UPDATE
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
    )
    WITH CHECK (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- DELETE: firm member
CREATE POLICY pricing_extras_delete ON pricing_extras
    FOR DELETE
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- ---------------------------------------------------------------------------
-- RLS Policies: leads
-- ---------------------------------------------------------------------------

-- INSERT (anon): firm must exist
CREATE POLICY leads_insert_anon ON leads
    FOR INSERT
    TO anon
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM firms WHERE firms.id = leads.firm_id
        )
    );

-- INSERT (authenticated): also allow authenticated inserts with firm check
CREATE POLICY leads_insert_auth ON leads
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM firms WHERE firms.id = leads.firm_id
        )
    );

-- SELECT (authenticated): firm member or platform owner
CREATE POLICY leads_select ON leads
    FOR SELECT
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
        OR has_role(auth.uid(), 'platform_owner')
    );

-- UPDATE: firm member
CREATE POLICY leads_update ON leads
    FOR UPDATE
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
    )
    WITH CHECK (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- ---------------------------------------------------------------------------
-- RLS Policies: quotes
-- ---------------------------------------------------------------------------

-- SELECT: firm member or platform owner
CREATE POLICY quotes_select ON quotes
    FOR SELECT
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
        OR has_role(auth.uid(), 'platform_owner')
    );

-- INSERT: firm member
CREATE POLICY quotes_insert ON quotes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- UPDATE: firm member
CREATE POLICY quotes_update ON quotes
    FOR UPDATE
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
    )
    WITH CHECK (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- DELETE: firm member
CREATE POLICY quotes_delete ON quotes
    FOR DELETE
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- ---------------------------------------------------------------------------
-- RLS Policies: quote_items
-- ---------------------------------------------------------------------------

-- SELECT: parent quote belongs to user's firm or platform owner
CREATE POLICY quote_items_select ON quote_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM quotes
            WHERE quotes.id = quote_items.quote_id
              AND (
                  get_user_firm_id(auth.uid()) = quotes.firm_id
                  OR has_role(auth.uid(), 'platform_owner')
              )
        )
    );

-- INSERT: parent quote belongs to user's firm
CREATE POLICY quote_items_insert ON quote_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM quotes
            WHERE quotes.id = quote_items.quote_id
              AND get_user_firm_id(auth.uid()) = quotes.firm_id
        )
    );

-- UPDATE: parent quote belongs to user's firm
CREATE POLICY quote_items_update ON quote_items
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM quotes
            WHERE quotes.id = quote_items.quote_id
              AND get_user_firm_id(auth.uid()) = quotes.firm_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM quotes
            WHERE quotes.id = quote_items.quote_id
              AND get_user_firm_id(auth.uid()) = quotes.firm_id
        )
    );

-- DELETE: parent quote belongs to user's firm
CREATE POLICY quote_items_delete ON quote_items
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM quotes
            WHERE quotes.id = quote_items.quote_id
              AND get_user_firm_id(auth.uid()) = quotes.firm_id
        )
    );

-- ---------------------------------------------------------------------------
-- RLS Policies: discount_codes
-- ---------------------------------------------------------------------------

-- SELECT (anon): active codes for public active firms
CREATE POLICY discount_codes_select_anon ON discount_codes
    FOR SELECT
    TO anon
    USING (
        is_active = true
        AND EXISTS (
            SELECT 1 FROM firms
            WHERE firms.id = discount_codes.firm_id
              AND firms.is_active = true
              AND firms.public_quote_form_enabled = true
        )
    );

-- SELECT (authenticated): firm member or platform owner
CREATE POLICY discount_codes_select_auth ON discount_codes
    FOR SELECT
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
        OR has_role(auth.uid(), 'platform_owner')
    );

-- INSERT: firm member
CREATE POLICY discount_codes_insert ON discount_codes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- UPDATE: firm member
CREATE POLICY discount_codes_update ON discount_codes
    FOR UPDATE
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
    )
    WITH CHECK (
        get_user_firm_id(auth.uid()) = firm_id
    );

-- DELETE: firm member
CREATE POLICY discount_codes_delete ON discount_codes
    FOR DELETE
    TO authenticated
    USING (
        get_user_firm_id(auth.uid()) = firm_id
    );
