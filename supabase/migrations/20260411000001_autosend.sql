-- Default auto_send_quote_emails to true so customers automatically receive
-- their quote estimate by email when they submit a public form. Firms can
-- still disable this from the Settings page if they prefer manual control.
alter table public.firms alter column auto_send_quote_emails set default true;
update public.firms set auto_send_quote_emails = true where auto_send_quote_emails is distinct from true;
