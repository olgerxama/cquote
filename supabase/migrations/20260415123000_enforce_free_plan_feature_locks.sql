-- Enforce premium feature locks at DB level so free plans cannot enable
-- professional-only behavior via direct API calls or client-side tampering.

create or replace function public.enforce_firm_plan_feature_locks()
returns trigger
language plpgsql
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

drop trigger if exists trg_enforce_firm_plan_feature_locks on public.firms;
create trigger trg_enforce_firm_plan_feature_locks
before insert or update on public.firms
for each row
execute function public.enforce_firm_plan_feature_locks();

-- Backfill existing rows so current data is consistent with the rule.
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

