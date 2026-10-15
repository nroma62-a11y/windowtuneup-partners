-- Per-job commission override. Run after schema-completed.sql.
-- A job uses its own commission if one was set while it was open (e.g. at the Quoted stage);
-- otherwise it uses the partner's default rate. It locks when the job is marked Purchased.

alter table public.referrals add column if not exists commission_type text check (commission_type in ('percent','fixed'));
alter table public.referrals add column if not exists commission_value numeric(10,2) check (commission_value >= 0);
alter table public.referrals drop constraint if exists referrals_commission_pair;
alter table public.referrals add constraint referrals_commission_pair check (
  (commission_type is null) = (commission_value is null)
  and (commission_type is distinct from 'percent' or commission_value <= 100)
);

-- Once purchased, the override can't be edited (the payout amount was fixed at that moment).
create or replace function public.lock_job_commission() returns trigger language plpgsql as $$
begin
  if old.status in ('purchased', 'completed', 'closed')
     and (new.commission_type is distinct from old.commission_type
          or new.commission_value is distinct from old.commission_value) then
    raise exception 'Commission is locked once a job is purchased';
  end if;
  return new;
end $$;
drop trigger if exists lock_job_commission on public.referrals;
create trigger lock_job_commission before update on public.referrals
  for each row execute function public.lock_job_commission();

-- Partners must not be able to set a commission on the leads they submit.
drop policy if exists "partners create own referrals" on public.referrals;
create policy "partners create own referrals" on public.referrals for insert to authenticated
with check (
  partner_id = auth.uid() and public.current_partner_role() = 'partner'
  and status = 'new' and final_job_value is null and commission_amount is null
  and invoice_number is null and inspection_at is null
  and commission_type is null and commission_value is null
);

-- Marking a job purchased now honours the per-job override, else the partner's rate.
create or replace function public.mark_referral_purchased(
  p_referral_id uuid, p_final_job_value numeric, p_invoice_number text
) returns numeric language plpgsql security definer set search_path = public
as $$
declare v_partner_id uuid; v_type text; v_value numeric; v_commission numeric;
begin
  if auth.uid() is null or public.current_partner_role() <> 'admin' then
    raise exception 'Admin role required';
  end if;
  if p_final_job_value is null or p_final_job_value <= 0 then
    raise exception 'Final job value must be greater than zero';
  end if;
  select partner_id, commission_type, commission_value into v_partner_id, v_type, v_value
    from public.referrals
    where id = p_referral_id and status not in ('purchased', 'completed', 'closed') for update;
  if v_partner_id is null then raise exception 'Referral not found or already purchased'; end if;

  if v_type is not null then
    v_commission := case v_type when 'fixed' then v_value else round(p_final_job_value * v_value / 100, 2) end;
  else
    v_commission := public.commission_for(v_partner_id, p_final_job_value);
  end if;
  if v_commission is null then raise exception 'Partner not found'; end if;
  if v_commission > p_final_job_value then raise exception 'Commission would exceed the job value'; end if;

  update public.referrals set status = 'purchased', final_job_value = p_final_job_value,
    invoice_number = p_invoice_number, commission_amount = v_commission, updated_at = now()
    where id = p_referral_id;
  return v_commission;
end $$;
revoke all on function public.mark_referral_purchased(uuid, numeric, text) from public;
grant execute on function public.mark_referral_purchased(uuid, numeric, text) to authenticated;
