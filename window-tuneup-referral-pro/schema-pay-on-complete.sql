-- Commission timing: PENDING when a job is sold (Purchased), PAID when it is Completed.
-- Run LAST, after schema-completed.sql and schema-job-commission.sql. It replaces the functions
-- those files created, so the order matters.
--
--   Purchased  -> the commission (the job's own, else the partner's default) is locked in,
--                 added to the partner's pending balance, and a pending payout is created.
--   Completed  -> "completed and paid": the payout is marked paid, the amount moves from the
--                 partner's pending balance to their paid-out total. Click it only after you
--                 have actually sent the money.

drop function if exists public.complete_referral_and_credit_commission(uuid);

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
  update public.partners set pending_payout = pending_payout + v_commission where id = v_partner_id;
  insert into public.payouts(partner_id, referral_id, amount, status, reference)
    values (v_partner_id, p_referral_id, v_commission, 'pending', p_invoice_number);
  return v_commission;
end $$;
revoke all on function public.mark_referral_purchased(uuid, numeric, text) from public;
grant execute on function public.mark_referral_purchased(uuid, numeric, text) to authenticated;

create or replace function public.complete_referral_and_mark_paid(p_referral_id uuid, p_reference text default null)
returns numeric language plpgsql security definer set search_path = public
as $$
declare v_partner_id uuid; v_payout_id uuid; v_amount numeric;
begin
  if auth.uid() is null or public.current_partner_role() <> 'admin' then
    raise exception 'Admin role required';
  end if;
  select partner_id into v_partner_id from public.referrals
    where id = p_referral_id and status = 'purchased' for update;
  if v_partner_id is null then raise exception 'Referral not found or not in Purchased status'; end if;

  select id, amount into v_payout_id, v_amount from public.payouts
    where referral_id = p_referral_id and status = 'pending' for update;
  if v_payout_id is null then raise exception 'No pending payout found for this referral'; end if;

  update public.payouts set status = 'paid', paid_at = now(), reference = coalesce(p_reference, reference)
    where id = v_payout_id;
  update public.partners set pending_payout = greatest(0, pending_payout - v_amount),
    total_paid = total_paid + v_amount where id = v_partner_id;
  update public.referrals set status = 'completed', updated_at = now() where id = p_referral_id;
  return v_amount;
end $$;
revoke all on function public.complete_referral_and_mark_paid(uuid, text) from public;
grant execute on function public.complete_referral_and_mark_paid(uuid, text) to authenticated;

-- One-time catch-up: jobs already Purchased under the earlier rule have no pending payout yet.
-- Give them one and add it to the partner's pending balance (never twice: it skips jobs that have a payout).
with added as (
  insert into public.payouts(partner_id, referral_id, amount, status, reference)
  select r.partner_id, r.id, r.commission_amount, 'pending', r.invoice_number
  from public.referrals r
  where r.status = 'purchased' and r.commission_amount is not null
    and not exists (select 1 from public.payouts p where p.referral_id = r.id)
  returning partner_id, amount
)
update public.partners pt set pending_payout = pt.pending_payout + a.total
from (select partner_id, sum(amount) as total from added group by partner_id) a
where pt.id = a.partner_id;
