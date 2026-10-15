import type { Partner } from './supabase';

type Rate = Pick<Partner, 'commission_type' | 'commission_value'> | undefined;
const cad = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

/** Mirrors public.commission_for() in schema-commission.sql. For previews only: the database is the source of truth. */
export function commissionFor(partner: Rate, jobValue: number): number {
  const value = Number(partner?.commission_value ?? 10);
  if ((partner?.commission_type ?? 'percent') === 'fixed') return value;
  return Math.round(jobValue * value) / 100;
}

export function describeCommission(partner: Rate): string {
  const value = Number(partner?.commission_value ?? 10);
  return (partner?.commission_type ?? 'percent') === 'fixed' ? `${cad(value)} per job` : `${value}% of job value`;
}
