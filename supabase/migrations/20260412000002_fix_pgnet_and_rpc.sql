-- Fix: correct http extension call syntax and replace pg_net.
-- The previous migration used extensions.http_header() as a function call,
-- but http_header is a TYPE — needs ROW()::type casting.

-- =========================================================================
-- 1. Remove pg_net (unreliable, causes security warnings)
-- =========================================================================
DROP EXTENSION IF EXISTS pg_net;

-- =========================================================================
-- 2. Ensure http extension exists
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- =========================================================================
-- 3. Recreate RPC with correct http extension syntax
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_public_lead(
  p_lead jsonb,
  p_discount_code_id uuid DEFAULT NULL,
  p_totals jsonb DEFAULT NULL,
  p_quote_items jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_lead_id uuid;
  v_firm record;
  v_quote_id uuid;
  v_reference_code text;
  v_instruction_ref text;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9oaGd1aHZhcGpqd2N3dHBoY3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4Njk4MjQsImV4cCI6MjA5MTQ0NTgyNH0.JMSWUyfBsd6IJM-GDicM-zKfZwemg3ogVwWjppUAi8Y';
BEGIN
  -- Validate firm
  SELECT * INTO v_firm FROM firms
  WHERE id = (p_lead->>'firm_id')::uuid
    AND is_active = true AND public_quote_form_enabled = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Firm not available'; END IF;

  -- Insert lead
  INSERT INTO leads (
    firm_id, full_name, first_name, surname, email, phone,
    service_type, property_value, tenure, mortgage_required,
    first_time_buyer, estimated_total, status, answers, discount_code_id
  ) VALUES (
    (p_lead->>'firm_id')::uuid, p_lead->>'full_name',
    p_lead->>'first_name', p_lead->>'surname',
    p_lead->>'email', p_lead->>'phone',
    p_lead->>'service_type', (p_lead->>'property_value')::numeric,
    COALESCE(p_lead->>'tenure', 'freehold'),
    COALESCE((p_lead->>'mortgage_required')::boolean, false),
    COALESCE((p_lead->>'first_time_buyer')::boolean, false),
    (p_lead->>'estimated_total')::numeric,
    COALESCE(p_lead->>'status', 'new'),
    COALESCE(p_lead->'answers', '{}'::jsonb),
    p_discount_code_id
  ) RETURNING id INTO v_lead_id;

  IF p_discount_code_id IS NOT NULL THEN
    PERFORM increment_discount_use_count(p_discount_code_id);
  END IF;

  -- Create quote + items
  IF p_totals IS NOT NULL AND COALESCE(p_lead->>'status', 'new') != 'review' THEN
    INSERT INTO quotes (lead_id, firm_id, status, subtotal, vat_total, grand_total, discount_total)
    VALUES (
      v_lead_id, (p_lead->>'firm_id')::uuid, 'draft',
      COALESCE((p_totals->>'subtotal')::numeric, 0),
      COALESCE((p_totals->>'vatTotal')::numeric, 0),
      COALESCE((p_totals->>'grandTotal')::numeric, 0), 0
    ) RETURNING id INTO v_quote_id;

    v_reference_code := 'CQ-' || upper(left(v_quote_id::text, 8));
    UPDATE quotes SET reference_code = v_reference_code WHERE id = v_quote_id;

    IF p_quote_items IS NOT NULL AND jsonb_array_length(p_quote_items) > 0 THEN
      INSERT INTO quote_items (quote_id, description, amount, is_vatable, item_type, sort_order, source_type)
      SELECT v_quote_id,
        COALESCE(item->>'description', 'Item'),
        COALESCE((item->>'amount')::numeric, 0),
        COALESCE((item->>'is_vatable')::boolean, true),
        COALESCE(item->>'item_type', 'fee'),
        COALESCE((item->>'sort_order')::int, (row_number() OVER ())::int),
        COALESCE(item->>'source_type', 'manual')
      FROM jsonb_array_elements(p_quote_items) AS item;
    END IF;
  END IF;

  v_instruction_ref := COALESCE(v_reference_code, v_lead_id::text);

  -- Fire email notification via synchronous http extension.
  -- search_path includes extensions so http/http_header resolve unqualified.
  BEGIN
    PERFORM http((
      'POST',
      'https://ohhguhvapjjwcwtphctd.supabase.co/functions/v1/create-public-lead',
      ARRAY[
        ROW('apikey', v_anon_key)::http_header,
        ROW('Authorization', 'Bearer ' || v_anon_key)::http_header,
        ROW('Content-Type', 'application/json')::http_header
      ],
      'application/json',
      jsonb_build_object('notifyLeadId', v_lead_id, 'firmId', (p_lead->>'firm_id')::uuid)::text
    )::http_request);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Email notification failed (will not block lead creation): %', SQLERRM;
  END;

  RETURN jsonb_build_object('id', v_lead_id, 'quoteId', v_quote_id, 'instructionRef', v_instruction_ref);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_lead(jsonb, uuid, jsonb, jsonb) TO anon, authenticated;
