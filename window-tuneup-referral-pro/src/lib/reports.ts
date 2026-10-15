import type { ReferralStatus } from './supabase';

export type ReportRow = {
  id: string; partner_id: string; status: ReferralStatus; created_at: string;
  final_job_value: number | null; commission_amount: number | null; duplicate_of: string | null;
  cancel_reason?: string | null; prospect_name?: string; partners?: { name: string } | null;
};
export type Stats = {
  leads: number; sold: number; open: number; cancelled: number; cancelledAfterSale: number;
  sales: number; commission: number;
  conversion: number | null; avgJob: number | null; commissionPct: number | null; cancelRate: number | null;
};
export type PartnerStats = Stats & { partnerId: string; name: string };
export type RangeKey = 'month' | '30d' | '90d' | 'year' | 'all';

const SOLD: ReferralStatus[] = ['purchased', 'completed', 'closed'];
const money2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** Duplicates are excluded before this is called. A lead counts as sold once it is Purchased. */
export function summarize(rows: ReportRow[]): Stats {
  const sold = rows.filter((r) => SOLD.includes(r.status));
  const cancelled = rows.filter((r) => r.status === 'cancelled');
  const sales = money2(sold.reduce((t, r) => t + Number(r.final_job_value ?? 0), 0));
  const commission = money2(sold.reduce((t, r) => t + Number(r.commission_amount ?? 0), 0));
  return {
    leads: rows.length, sold: sold.length, cancelled: cancelled.length,
    cancelledAfterSale: cancelled.filter((r) => Number(r.final_job_value ?? 0) > 0).length,
    open: rows.length - sold.length - cancelled.length,
    sales, commission,
    conversion: ratio(sold.length, rows.length),
    avgJob: sold.length ? money2(sales / sold.length) : null,
    commissionPct: ratio(commission, sales),
    cancelRate: ratio(cancelled.length, rows.length),
  };
}

export function rangeStart(key: RangeKey, now = new Date()): string | null {
  if (key === 'all') return null;
  if (key === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (key === 'year') return new Date(now.getFullYear(), 0, 1).toISOString();
  const days = key === '30d' ? 30 : 90;
  return new Date(now.getTime() - days * 864e5).toISOString();
}

/** Groups leads by the date they were RECEIVED, so conversion compares like with like. */
export function buildReport(rows: ReportRow[], since: string | null) {
  const inRange = rows.filter((r) => !r.duplicate_of && (!since || r.created_at >= since));
  const groups = new Map<string, ReportRow[]>();
  for (const r of inRange) groups.set(r.partner_id, [...(groups.get(r.partner_id) ?? []), r]);
  const byPartner: PartnerStats[] = [...groups.entries()]
    .map(([partnerId, list]) => ({ partnerId, name: list[0].partners?.name ?? 'Unknown', ...summarize(list) }))
    .sort((a, b) => b.sales - a.sales || b.leads - a.leads);
  const recentCancellations = inRange.filter((r) => r.status === 'cancelled')
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const duplicates = rows.filter((r) => r.duplicate_of && (!since || r.created_at >= since)).length;
  return { overall: summarize(inRange), byPartner, recentCancellations, duplicates };
}
