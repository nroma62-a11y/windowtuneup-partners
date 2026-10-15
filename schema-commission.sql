-- Per-partner commission. Run after schema.sql (before or after schema-invite-only.sql).

-- Each partner has their own rate: a percentage of the final job value, or a fixed amount per job.
alter table public.partners add column if not exists commission_type text not null default 'percent'
  check (commission_type in ('percent','fixed'));
alter table public.partners add column if not exists commission_value numeric(10,2) not null default 10
  check (commission_value >= 0);
alter table public.partners drop constraint if exists partners_percent_max;
alter table public.partners add constraint partners_percent_max
  check (commission_type <> 'percent' or commission_value <= 100);

create or replace function public.commission_for(p_partner_id uuid, p_job_value numeric)
returns numeric language sql stable security definer set search_path = public
as $$
  select case commission_type when 'fixed' then commission_value
              else round(p_job_value * commission_value / 100, 2) end
  from public.partners where id = p_partner_id
$$;
revoke all on function public.commission_for(uuid, numeric) from public;
