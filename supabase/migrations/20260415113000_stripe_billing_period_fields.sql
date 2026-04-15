alter table public.firms
  add column if not exists stripe_subscription_current_period_end timestamptz,
  add column if not exists stripe_subscription_cancel_at_period_end boolean not null default false;

