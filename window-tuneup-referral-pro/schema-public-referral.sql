-- Public referral page support. Run after the other schema files.
-- customer_consent: the sender confirmed the customer expects our call.
-- source: where the lead came from ('public_link' = the /r/<code> page, 'portal' = a partner's dashboard).
alter table public.referrals add column if not exists customer_consent boolean not null default false;
alter table public.referrals add column if not exists source text not null default 'portal'
  check (source in ('portal', 'public_link'));
create index if not exists referrals_partner_source_created_idx on public.referrals(partner_id, source, created_at desc);
