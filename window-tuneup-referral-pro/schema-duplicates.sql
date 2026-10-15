-- Duplicate referral rule: the FIRST partner to refer a customer owns the credit for 90 days.
-- Run after schema-cancel.sql (the check below uses the 'cancelled' status).
--
-- A new referral is flagged as a duplicate when an earlier, still-active referral has the same
-- phone number or the same street address (ignoring spacing, case and punctuation) and was
-- created in the last 90 days. A duplicate is kept on record but stays out of the pipeline and
-- can never earn commission until an admin resolves it. To change the 90 days, edit the interval below.
-- This runs inside the database, so it covers the public link and the partner dashboard alike.

alter table public.referrals add column if not exists duplicate_of uuid references public.referrals(id) on delete set null;
alter table public.referrals add column if not exists duplicate_resolution text
  check (duplicate_resolution in ('kept_original', 'credited_new', 'promoted'));
create index if not exists referrals_duplicate_of_idx on public.referrals(duplicate_of) where duplicate_of is not null;

-- SECURITY DEFINER on purpose: a partner can only see their own rows, but matching has to see everyone's.
create or replace function public.flag_duplicate_referral() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_digits text; v_addr text; v_original uuid;
begin
  new.duplicate_of := null;          -- never trust values sent by the client
  new.duplicate_resolution := null;
  v_digits := regexp_replace(coalesce(new.prospect_phone, ''), '\D', '', 'g');
  if length(v_digits) = 11 and left(v_digits, 1) = '1' then v_digits := substr(v_digits, 2); end if;
  v_addr := regexp_replace(lower(coalesce(new.property_address, '')), '[^a-z0-9]', '', 'g');

  select r.id into v_original from public.referrals r
  where r.duplicate_of is null
    and r.status::text <> 'cancelled'
    and r.created_at > now() - interval '90 days'
    and ( (length(v_digits) = 10 and right(regexp_replace(coalesce(r.prospect_phone, ''), '\D', '', 'g'), 10) = v_digits)
       or (length(v_addr) >= 8 and regexp_replace(lower(coalesce(r.property_address, '')), '[^a-z0-9]', '', 'g') = v_addr) )
  order by r.created_at asc limit 1;

  new.duplicate_of := v_original;
  return new;
end $$;

drop trigger if exists flag_duplicate_referral on public.referrals;
create trigger flag_duplicate_referral before insert on public.referrals
  for each row execute function public.flag_duplicate_referral();

-- Admin decisions on a flagged duplicate:
--   keep        the original partner keeps the credit; the duplicate stays on record
--   credit_new  move the original lead to the new partner (only before it is sold)
--   promote     treat it as its own lead (e.g. the original fell through or is out of date)
create or replace function public.resolve_duplicate(p_referral_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_dup public.referrals; v_orig public.referrals;
begin
  if auth.uid() is null or public.current_partner_role() <> 'admin' then
    raise exception 'Admin role required';
  end if;
  select * into v_dup from public.referrals
    where id = p_referral_id and duplicate_of is not null and duplicate_resolution is null for update;
  if not found then raise exception 'Duplicate not found or already resolved'; end if;

  if p_action = 'keep' then
    update public.referrals set duplicate_resolution = 'kept_original', updated_at = now() where id = v_dup.id;
  elsif p_action = 'credit_new' then
    select * into v_orig from public.referrals where id = v_dup.duplicate_of for update;
    if not found or v_orig.status::text not in ('new', 'contacted', 'inspection_scheduled', 'quoted') then
      raise exception 'The original lead is already sold, completed, or cancelled, so credit cannot be moved here. Adjust it by hand.';
    end if;
    update public.referrals set partner_id = v_dup.partner_id, updated_at = now() where id = v_orig.id;
    update public.referrals set duplicate_resolution = 'credited_new', updated_at = now() where id = v_dup.id;
  elsif p_action = 'promote' then
    update public.referrals set duplicate_of = null, duplicate_resolution = 'promoted', updated_at = now() where id = v_dup.id;
  else
    raise exception 'Unknown action';
  end if;
end $$;
revoke all on function public.resolve_duplicate(uuid, text) from public;
grant execute on function public.resolve_duplicate(uuid, text) to authenticated;
