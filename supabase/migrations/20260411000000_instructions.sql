-- Promote instruction_submitted_at from leads.answers JSONB into a real column
-- so Postgres can index it, sort by it, and filter it cheaply. This powers
-- "instructed leads first" ordering in the admin Leads list and the
-- Instructions page server-side filtering.

alter table public.leads
  add column if not exists instruction_submitted_at timestamptz;

-- Backfill from any existing JSONB payloads
update public.leads
set instruction_submitted_at = (answers->>'instruction_submitted_at')::timestamptz
where instruction_submitted_at is null
  and answers ? 'instruction_submitted_at';

create index if not exists leads_instruction_submitted_at_idx
  on public.leads (firm_id, instruction_submitted_at desc nulls last);
