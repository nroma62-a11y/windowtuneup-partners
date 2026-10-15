-- Cancelling jobs (lost leads and sales that fall through) and reopening them.
-- Run after the other schema files. If Supabase complains about using the new status value,
-- run the first statement on its own, then the rest.

alter type public.referral_status add value if not exists 'cancelled';

alter table public.referrals add column if not exists cancel_reason text;
alter table public.referrals add column if not exists cancelled_at timestamptz;

-- Works on any open lead. If the job was already sold (Purchased), the partner's pending
-- commission for it is cancelled and removed from their pending balance. Completed jobs are
-- already paid, so they cannot be cancelled here: handle any refund or clawback outside the app.
create or replace function public.cancel_referral(p_referral_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare v_status text; v_partner uuid; v_payout_id uuid; v_amount numeric;
begin
  if auth.uid() is null or public.current_partner_role() <> 'admin' then
    raise exception 'Admin role required';
  end if;
  select status::text, partner_id into v_status, v_partner
    from public.referrals where id = p_referral_id for update;
  if v_status is null then raise exception 'Referral not found'; end if;
  if v_status in ('completed', 'closed') then
    raise exception 'This job is already completed and paid. Record any refund outside the app.';
  end if;
  if v_status = 'cancelled' then raise exception 'This referral is already cancelled'; end if;

  if v_status = 'purchased' then
    select id, amount into v_payout_id, v_amount from public.payouts
      where referral_id = p_referral_id and status = 'pending' for update;
    if v_payout_id is not null then
      update public.payouts set status = 'cancelled' where id = v_payout_id;
      update public.partners set pending_payout = greatest(0, pending_payout - v_amount) where id = v_partner;
    end if;
  end if;

  update public.referrals set status = 'cancelled', cancel_reason = nullif(btrim(p_reason), ''),
    cancelled_at = now(), updated_at = now() where id = p_referral_id;
end $$;
revoke all on function public.cancel_referral(uuid, text) from public;
grant execute on function public.cancel_referral(uuid, text) to authenticated;

-- Puts a cancelled lead back to New and clears the old sale figures (a new sale creates a new payout).
create or replace function public.reopen_referral(p_referral_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.current_partner_role() <> 'admin' then
    raise exception 'Admin role required';
  end if;
  update public.referrals set status = 'new', cancel_reason = null, cancelled_at = null,
    final_job_value = null, commission_amount = null, invoice_number = null, updated_at = now()
    where id = p_referral_id and status = 'cancelled';
  if not found then raise exception 'Referral not found or not cancelled'; end if;
end $$;
revoke all on function public.reopen_referral(uuid) from public;
grant execute on function public.reopen_referral(uuid) to authenticated;
