-- Invite-only access migration. Run AFTER schema.sql, in the Supabase SQL Editor.

-- 1) Accounts are created by an admin with a username + generated password.
alter table public.partners add column if not exists username text unique;
alter table public.partners add column if not exists active boolean not null default true;
alter table public.partners add column if not exists must_change_password boolean not null default true;
alter table public.partners drop constraint if exists partners_username_format;
alter table public.partners add constraint partners_username_format
  check (username is null or username ~ '^[a-z0-9._-]{3,32}$');

-- Your own admin row already exists: set its username and skip the forced password change, e.g.
--   update public.partners set username='roman', must_change_password=false where role='admin';

-- 2) A deactivated partner loses every policy that depends on this function.
create or replace function public.current_partner_role()
returns public.partner_role language sql stable security definer set search_path = public
as $$ select role from public.partners where id = auth.uid() and active $$;

-- 3) Closes a hole in schema.sql: partners could previously insert a referral that already
--    said status='purchased' with a commission. They may now only create a plain new lead.
drop policy if exists "partners create own referrals" on public.referrals;
create policy "partners create own referrals" on public.referrals for insert to authenticated
with check (
  partner_id = auth.uid() and public.current_partner_role() = 'partner'
  and status = 'new' and final_job_value is null and commission_amount is null
  and invoice_number is null and inspection_at is null
);

-- 4) "Request to become a partner" submissions. No anonymous policy on purpose: the public
--    Netlify function inserts with the service role after validation and spam checks.
create table if not exists public.partner_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  business text,
  message text,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now()
);
create index if not exists partner_requests_status_idx on public.partner_requests(status, created_at desc);
alter table public.partner_requests enable row level security;
drop policy if exists "admins manage requests" on public.partner_requests;
create policy "admins manage requests" on public.partner_requests for all to authenticated
using (public.current_partner_role() = 'admin') with check (public.current_partner_role() = 'admin');

-- 5) Partners can't update their own row (by design), so the forced first-login password
--    change clears its flag through this narrow function.
create or replace function public.clear_must_change_password()
returns void language sql security definer set search_path = public
as $$ update public.partners set must_change_password = false where id = auth.uid() $$;
revoke all on function public.clear_must_change_password() from public;
grant execute on function public.clear_must_change_password() to authenticated;

-- 6) Found by testing: a deactivated partner could still read their OWN referrals and payouts
--    by calling the database directly. They now lose that read access too. (They can still read
--    their own partner row, so the app can show "this account has been deactivated".)
drop policy if exists "partners read own referrals or admin" on public.referrals;
create policy "partners read own referrals or admin" on public.referrals for select to authenticated
using ((partner_id = auth.uid() and public.current_partner_role() is not null) or public.current_partner_role() = 'admin');

drop policy if exists "partners read own payouts or admin" on public.payouts;
create policy "partners read own payouts or admin" on public.payouts for select to authenticated
using ((partner_id = auth.uid() and public.current_partner_role() is not null) or public.current_partner_role() = 'admin');
