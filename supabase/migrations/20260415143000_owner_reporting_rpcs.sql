-- Scalable owner-reporting RPCs to avoid pulling large datasets into the client.

create or replace function public.get_owner_report_summary()
returns table (
  total_firms bigint,
  active_firms bigint,
  pro_firms bigint,
  total_leads bigint,
  leads_30_days bigint,
  instructed_leads bigint,
  instruction_rate numeric,
  total_quotes bigint,
  quote_revenue numeric,
  team_members bigint,
  avg_members_per_firm numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null or not public.has_role(_uid, 'platform_owner') then
    raise exception 'forbidden';
  end if;

  return query
  with
    firm_counts as (
      select
        count(*)::bigint as total_firms,
        count(*) filter (where is_active)::bigint as active_firms,
        count(*) filter (where plan_type = 'professional')::bigint as pro_firms
      from public.firms
    ),
    lead_counts as (
      select
        count(*)::bigint as total_leads,
        count(*) filter (where created_at >= now() - interval '30 days')::bigint as leads_30_days,
        count(*) filter (where instruction_submitted_at is not null)::bigint as instructed_leads
      from public.leads
    ),
    quote_counts as (
      select
        count(*)::bigint as total_quotes,
        coalesce(sum(case when status in ('sent', 'accepted') then grand_total else 0 end), 0)::numeric as quote_revenue
      from public.quotes
    ),
    member_counts as (
      select count(*)::bigint as team_members from public.firm_users
    )
  select
    fc.total_firms,
    fc.active_firms,
    fc.pro_firms,
    lc.total_leads,
    lc.leads_30_days,
    lc.instructed_leads,
    case when lc.total_leads = 0 then 0 else round((lc.instructed_leads::numeric / lc.total_leads::numeric) * 100, 2) end as instruction_rate,
    qc.total_quotes,
    qc.quote_revenue,
    mc.team_members,
    case when fc.total_firms = 0 then 0 else round(mc.team_members::numeric / fc.total_firms::numeric, 2) end as avg_members_per_firm
  from firm_counts fc
  cross join lead_counts lc
  cross join quote_counts qc
  cross join member_counts mc;
end;
$$;

create or replace function public.get_owner_top_firms(_limit integer default 20, _offset integer default 0)
returns table (
  firm_id uuid,
  name text,
  plan_type text,
  is_active boolean,
  leads bigint,
  instructions bigint,
  members bigint,
  conversion numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _safe_limit integer := greatest(1, least(coalesce(_limit, 20), 100));
  _safe_offset integer := greatest(0, coalesce(_offset, 0));
begin
  if _uid is null or not public.has_role(_uid, 'platform_owner') then
    raise exception 'forbidden';
  end if;

  return query
  with lead_agg as (
    select
      l.firm_id,
      count(*)::bigint as leads,
      count(*) filter (where l.instruction_submitted_at is not null)::bigint as instructions
    from public.leads l
    group by l.firm_id
  ),
  member_agg as (
    select fu.firm_id, count(*)::bigint as members
    from public.firm_users fu
    group by fu.firm_id
  )
  select
    f.id as firm_id,
    f.name,
    f.plan_type,
    f.is_active,
    coalesce(la.leads, 0) as leads,
    coalesce(la.instructions, 0) as instructions,
    coalesce(ma.members, 0) as members,
    case when coalesce(la.leads, 0) = 0 then 0 else round((coalesce(la.instructions, 0)::numeric / la.leads::numeric) * 100, 2) end as conversion
  from public.firms f
  left join lead_agg la on la.firm_id = f.id
  left join member_agg ma on ma.firm_id = f.id
  order by coalesce(la.leads, 0) desc, f.created_at desc
  limit _safe_limit
  offset _safe_offset;
end;
$$;

