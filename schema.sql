-- Window Tune-Up Co. Referral Pro — Supabase schema
-- Run in Supabase SQL Editor as project owner. Review policies before production rollout.
create extension if not exists pgcrypto;

create type public.partner_role as enum ('admin', 'partner');
create type public.referral_status as enum ('new', 'contacted', 'inspection_scheduled', 'quoted', 'purchased', 'closed');

create table if not exists public.partners (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text,
  role public.partner_role not null default 'partner',
  share_code text not null unique,
  total_paid numeric(12,2) not null default 0 check (total_paid >= 0),
  pending_payout numeric(12,2) not null default 0 check (pending_payout >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  prospect_name text not null,
  prospect_phone text not null,
  property_address text not null,
  notes text,
  status public.referral_status not null default 'new',
  final_job_value numeric(12,2) check (final_job_value is null or final_job_value >= 0),
  commission_amount numeric(12,2) check (commission_amount is null or commission_amount >= 0),
  invoice_number text,
  inspection_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  referral_id uuid references public.referrals(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  paid_at timestamptz,
  reference text,
  created_at timestamptz not null default now()
);

create index if not exists referrals_partner_id_created_idx on public.referrals(partner_id, created_at desc);
create index if not exists referrals_status_idx on public.referrals(status);
create index if not exists payouts_partner_id_created_idx on public.payouts(partner_id, created_at desc);

alter table public.partners enable row level security;
alter table public.referrals enable row level security;
alter table public.payouts enable row level security;

-- SECURITY DEFINER role helper avoids recursive RLS queries on partners.
create or replace function public.current_partner_role()
returns public.partner_role language sql stable security definer set search_path = public
as $$ select role from public.partners where id = auth.uid() $$;
revoke all on function public.current_partner_role() from public;
grant execute on function public.current_partner_role() to authenticated;

drop policy if exists "partners read self or admin" on public.partners;
create policy "partners read self or admin" on public.partners for select to authenticated
using (id = auth.uid() or public.current_partner_role() = 'admin');
drop policy if exists "admins manage partners" on public.partners;
create policy "admins manage partners" on public.partners for all to authenticated
using (public.current_partner_role() = 'admin') with check (public.current_partner_role() = 'admin');

drop policy if exists "partners read own referrals or admin" on public.referrals;
create policy "partners read own referrals or admin" on public.referrals for select to authenticated
using (partner_id = auth.uid() or public.current_partner_role() = 'admin');
drop policy if exists "partners create own referrals" on public.referrals;
create policy "partners create own referrals" on public.referrals for insert to authenticated
with check (partner_id = auth.uid() and public.current_partner_role() = 'partner');
drop policy if exists "admins update referrals" on public.referrals;
create policy "admins update referrals" on public.referrals for update to authenticated
using (public.current_partner_role() = 'admin') with check (public.current_partner_role() = 'admin');

drop policy if exists "partners read own payouts or admin" on public.payouts;
create policy "partners read own payouts or admin" on public.payouts for select to authenticated
using (partner_id = auth.uid() or public.current_partner_role() = 'admin');
drop policy if exists "admins manage payouts" on public.payouts;
create policy "admins manage payouts" on public.payouts for all to authenticated
using (public.current_partner_role() = 'admin') with check (public.current_partner_role() = 'admin');

-- Atomic admin close-out: update referral and partner pending commission in one transaction.
create or replace function public.close_referral_and_credit_commission(
  p_referral_id uuid, p_final_job_value numeric, p_invoice_number text, p_commission_amount numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare v_partner_id uuid;
begin
  if auth.uid() is null or public.current_partner_role() <> 'admin' then
    raise exception 'Admin role required';
  end if;
  if p_final_job_value <= 0 or p_commission_amount < 0 or p_commission_amount <> round(p_final_job_value * 0.10, 2) then
    raise exception 'Invalid job value or commission; commission must be exactly 10 percent';
  end if;
  select partner_id into v_partner_id from public.referrals where id = p_referral_id for update;
  if v_partner_id is null then raise exception 'Referral not found'; end if;
  update public.referrals set status='purchased', final_job_value=p_final_job_value,
    invoice_number=p_invoice_number, commission_amount=p_commission_amount, updated_at=now()
    where id=p_referral_id;
  update public.partners set pending_payout=pending_payout+p_commission_amount where id=v_partner_id;
  insert into public.payouts(partner_id, referral_id, amount, status, reference)
    values(v_partner_id, p_referral_id, p_commission_amount, 'pending', p_invoice_number);
end $$;
revoke all on function public.close_referral_and_credit_commission(uuid,numeric,text,numeric) from public;
grant execute on function public.close_referral_and_credit_commission(uuid,numeric,text,numeric) to authenticated;

-- Mark a payout as paid using this function; totals are maintained atomically.
create or replace function public.mark_payout_paid(p_payout_id uuid, p_reference text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare v_partner_id uuid; v_amount numeric;
begin
  if auth.uid() is null or public.current_partner_role() <> 'admin' then raise exception 'Admin role required'; end if;
  select partner_id, amount into v_partner_id, v_amount from public.payouts where id=p_payout_id and status='pending' for update;
  if v_partner_id is null then raise exception 'Pending payout not found'; end if;
  update public.payouts set status='paid', paid_at=now(), reference=coalesce(p_reference,reference) where id=p_payout_id;
  update public.partners set pending_payout=greatest(0,pending_payout-v_amount), total_paid=total_paid+v_amount where id=v_partner_id;
end $$;
revoke all on function public.mark_payout_paid(uuid,text) from public;
grant execute on function public.mark_payout_paid(uuid,text) to authenticated;

-- IMPORTANT: create partner profiles via a trusted admin/server-side provisioning process.
-- Do not allow public signup to assign its own role. Set auth.users.id = partners.id.
