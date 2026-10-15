-- NOTE: the commission timing described in this file is superseded by schema-pay-on-complete.sql (run that last).
-- Adds the "Completed" stage and moves the commission credit to it. Run after schema.sql and
-- schema-commission.sql. If Supabase complains about using a new enum value, run the first
-- statement on its own, then run the rest.
--
-- Flow:  new -> contacted -> inspection_scheduled -> quoted -> purchased -> completed
--  * Purchased: customer said yes. You enter the final job value and invoice number; the
--    partner's commission is calculated from THEIR rate at that moment and locked in.
--  * Completed: work finished. Only now is the commission credited to the partner's pending
--    balance and a pending payout created.

alter type public.referral_status add value if not exists 'completed';

drop function if exists public.close_referral_and_credit_commission(uuid, numeric, text, numeric);
drop function if exists public.close_referral_and_credit_commission(uuid, numeric, text);

create or replace function public.mark_referral_purchased(
  p_referral_id uuid, p_final_job_value numeric, p_invoice_number text
) returns numeric language plpgsql security definer set search_path = public
as $$
declare v_partner_id uuid; v_commission numeric;
begin
  if auth.uid() is null or public.current_partner_role() <> 'admin' then
    raise exception 'Admin role required';
  end if;
  if p_final_job_value is null or p_final_job_value <= 0 then
    raise exception 'Final job value must be greater than zero';
  end if;
  select partner_id into v_partner_id from public.referrals
    where id = p_referral_id and status not in ('purchased', 'completed', 'closed') for update;
  if v_partner_id is null then raise exception 'Referral not found or already purchased'; end if;

  v_commission := public.commission_for(v_partner_id, p_final_job_value);
  if v_commission is null then raise exception 'Partner not found'; end if;
  if v_commission > p_final_job_value then raise exception 'Commission would exceed the job value'; end if;

  update public.referrals set status = 'purchased', final_job_value = p_final_job_value,
    invoice_number = p_invoice_number, commission_amount = v_commission, updated_at = now()
    where id = p_referral_id;
  return v_commission;
end $$;
revoke all on function public.mark_referral_purchased(uuid, numeric, text) from public;
grant execute on function public.mark_referral_purchased(uuid, numeric, text) to authenticated;

create or replace function public.complete_referral_and_credit_commission(p_referral_id uuid)
returns numeric language plpgsql security definer set search_path = public
as $$
declare v_partner_id uuid; v_commission numeric; v_invoice text;
begin
  if auth.uid() is null or public.current_partner_role() <> 'admin' then
    raise exception 'Admin role required';
  end if;
  select partner_id, commission_amount, invoice_number into v_partner_id, v_commission, v_invoice
    from public.referrals where id = p_referral_id and status = 'purchased' for update;
  if v_partner_id is null then raise exception 'Referral not found or not in Purchased status'; end if;
  if v_commission is null then raise exception 'No commission recorded for this referral'; end if;

  -- Jobs closed under the older flow already have a payout. Never credit twice.
  if exists (select 1 from public.payouts where referral_id = p_referral_id) then
    update public.referrals set status = 'completed', updated_at = now() where id = p_referral_id;
    return v_commission;
  end if;

  update public.referrals set status = 'completed', updated_at = now() where id = p_referral_id;
  update public.partners set pending_payout = pending_payout + v_commission where id = v_partner_id;
  insert into public.payouts(partner_id, referral_id, amount, status, reference)
    values (v_partner_id, p_referral_id, v_commission, 'pending', v_invoice);
  return v_commission;
end $$;
revoke all on function public.complete_referral_and_credit_commission(uuid) from public;
grant execute on function public.complete_referral_and_credit_commission(uuid) to authenticated;
