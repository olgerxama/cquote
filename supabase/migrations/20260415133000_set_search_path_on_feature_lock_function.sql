-- Security advisor fix:
-- Ensure function search_path is fixed (not mutable).

create or replace function public.enforce_firm_plan_feature_locks()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_professional_access boolean;
  cfg jsonb;
begin
  has_professional_access :=
    new.plan_type = 'professional'
    and coalesce(new.stripe_subscription_status, '') in ('active', 'trialing');

  if not has_professional_access then
    new.show_instant_quote := false;
    new.show_estimate_document := false;
    new.auto_send_quote_emails := false;

    cfg := coalesce(new.public_form_config, '{}'::jsonb);
    cfg := jsonb_set(cfg, '{show_discount_code}', 'false'::jsonb, true);
    cfg := jsonb_set(cfg, '{show_instruct_button}', 'false'::jsonb, true);
    new.public_form_config := cfg;
  end if;

  return new;
end;
$$;

