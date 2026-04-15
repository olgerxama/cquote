-- Recreate the free-plan feature lock trigger in a standalone SQL migration.
-- This can be run safely even if prior attempts were partial.

drop trigger if exists trg_enforce_firm_plan_feature_locks on public.firms;
drop function if exists public.enforce_firm_plan_feature_locks();

create function public.enforce_firm_plan_feature_locks()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_professional_access boolean;
  cfg jsonb;
begin
  -- Professional access is only valid when both plan and Stripe status match.
  has_professional_access :=
    new.plan_type = 'professional'
    and coalesce(new.stripe_subscription_status, '') in ('active', 'trialing');

  -- If a firm is free (or downgraded), force premium settings OFF.
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

create trigger trg_enforce_firm_plan_feature_locks
before insert or update on public.firms
for each row
execute function public.enforce_firm_plan_feature_locks();

-- Backfill all existing rows now, so downgraded/free firms are corrected immediately.
update public.firms
set
  show_instant_quote = false,
  show_estimate_document = false,
  auto_send_quote_emails = false,
  public_form_config = jsonb_set(
    jsonb_set(coalesce(public_form_config, '{}'::jsonb), '{show_discount_code}', 'false'::jsonb, true),
    '{show_instruct_button}', 'false'::jsonb, true
  )
where not (
  plan_type = 'professional'
  and coalesce(stripe_subscription_status, '') in ('active', 'trialing')
);
