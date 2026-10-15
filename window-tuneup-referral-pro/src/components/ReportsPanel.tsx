import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buildReport, rangeStart, RangeKey, ReportRow } from '../lib/reports';
import { downloadCsv } from '../lib/csv';

const money = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
const pct = (n: number | null, digits = 0) => (n === null ? '—' : `${(n * 100).toFixed(digits)}%`);
const PAGE = 1000; // Supabase returns at most 1000 rows per request, so read in pages

/** Admin reports: conversion, average job value, commission as a share of sales, and cancellations. */
export default function ReportsPanel() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [range, setRange] = useState<RangeKey>('90d');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all: ReportRow[] = [];
      for (let page = 0; page < 10; page++) {
        const { data, error: e } = await supabase.from('referrals')
          .select('id, partner_id, status, created_at, final_job_value, commission_amount, duplicate_of, cancel_reason, prospect_name, partners(name)')
          .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
        if (e) { if (alive) setError(e.message); break; }
        all.push(...((data ?? []) as unknown as ReportRow[]));
        if ((data?.length ?? 0) < PAGE) break;
      }
      if (alive) { setRows(all); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const report = useMemo(() => buildReport(rows, rangeStart(range)), [rows, range]);
  const o = report.overall;
  const cards: [string, string, string?][] = [
    ['Leads received', String(o.leads), `${o.open} still open`],
    ['Conversion', pct(o.conversion), `${o.sold} sold of ${o.leads}`],
    ['Sales', money(o.sales)],
    ['Average job', o.avgJob === null ? '—' : money(o.avgJob)],
    ['Commission % of sales', pct(o.commissionPct, 1), money(o.commission) + ' commission'],
    ['Cancelled', String(o.cancelled), `${pct(o.cancelRate)} of leads · ${o.cancelledAfterSale} after a sale`],
  ];

  function exportCsv() {
    downloadCsv(`partner-report-${range}.csv`,
      ['Partner', 'Leads', 'Sold', 'Conversion %', 'Sales', 'Average job', 'Commission', 'Commission % of sales', 'Cancelled'],
      report.byPartner.map((p) => [p.name, p.leads, p.sold, p.conversion === null ? '' : (p.conversion * 100).toFixed(1), p.sales.toFixed(2), p.avgJob === null ? '' : p.avgJob.toFixed(2), p.commission.toFixed(2), p.commissionPct === null ? '' : (p.commissionPct * 100).toFixed(1), p.cancelled]));
  }

  return (
    <section className="surface mt-8 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-bold">Reports</h2><p className="text-xs text-slate-500">Based on when each lead was received. Duplicates are left out{report.duplicates ? ` (${report.duplicates} in this period)` : ''}.</p></div>
        <div className="flex items-center gap-2">
          <select className="field !mt-0 !w-auto" value={range} onChange={(e) => setRange(e.target.value as RangeKey)} aria-label="Report period">
            <option value="month">This month</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="year">This year</option><option value="all">All time</option>
          </select>
          <button className="btn-secondary !py-2 text-xs" onClick={exportCsv} disabled={!report.byPartner.length}><Download size={14} /> Export CSV</button>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : <>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {cards.map(([label, value, sub]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{value}</p>{sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}</div>
          ))}
        </div>
        <div className="mt-5 overflow-x-auto">
          {report.byPartner.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No leads in this period.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-4">Partner</th><th className="pr-4">Leads</th><th className="pr-4">Sold</th><th className="pr-4">Conversion</th><th className="pr-4">Sales</th><th className="pr-4">Avg job</th><th className="pr-4">Commission</th><th className="pr-4">% of sales</th><th>Cancelled</th></tr></thead>
              <tbody>{report.byPartner.map((p) => (
                <tr key={p.partnerId} className="border-t border-slate-100 tabular-nums">
                  <td className="py-2 pr-4 font-semibold">{p.name}</td><td className="pr-4">{p.leads}</td><td className="pr-4">{p.sold}</td><td className="pr-4">{pct(p.conversion)}</td>
                  <td className="pr-4">{money(p.sales)}</td><td className="pr-4">{p.avgJob === null ? '—' : money(p.avgJob)}</td><td className="pr-4">{money(p.commission)}</td><td className="pr-4">{pct(p.commissionPct, 1)}</td><td>{p.cancelled}</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
        {report.recentCancellations.length > 0 && <div className="mt-5"><h3 className="text-sm font-bold">Recent cancellations</h3>
          <ul className="mt-2 space-y-1 text-sm">{report.recentCancellations.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"><span><b>{r.prospect_name}</b> <span className="text-slate-500">via {r.partners?.name ?? 'Unknown'}</span></span><span className="text-slate-500">{r.cancel_reason || 'No reason given'}{Number(r.final_job_value ?? 0) > 0 ? ` · after a ${money(Number(r.final_job_value))} sale` : ''}</span></li>))}</ul></div>}
      </>}
    </section>
  );
}
