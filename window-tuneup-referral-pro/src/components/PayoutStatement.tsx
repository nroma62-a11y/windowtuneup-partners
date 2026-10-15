import { useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Partner, supabase } from '../lib/supabase';
import { downloadCsv } from '../lib/csv';

type Row = { id: string; amount: number; status: 'pending' | 'paid' | 'cancelled'; paid_at: string | null; reference: string | null; created_at: string; referrals: { prospect_name: string } | null };
const money = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-CA') : '');
const when = (r: Row) => (r.status === 'paid' && r.paid_at ? r.paid_at : r.created_at);

/** A partner's own payout statement by year. Only their own payouts load: the database enforces that. */
export default function PayoutStatement({ partner }: { partner: Pick<Partner, 'id' | 'name'> }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.from('payouts').select('id, amount, status, paid_at, reference, created_at, referrals(prospect_name)')
      .eq('partner_id', partner.id).order('created_at', { ascending: false }).limit(1000)
      .then(({ data, error: e }: { data: unknown; error: { message: string } | null }) => { if (!alive) return; if (e) setError(e.message); else setRows((data ?? []) as Row[]); });
    return () => { alive = false; };
  }, [partner.id]);

  const years = useMemo(() => [...new Set([new Date().getFullYear(), ...rows.map((r) => new Date(when(r)).getFullYear())])].sort((a, b) => b - a), [rows]);
  const inYear = rows.filter((r) => new Date(when(r)).getFullYear() === year);
  const paid = inYear.filter((r) => r.status === 'paid').reduce((t, r) => t + Number(r.amount), 0);
  const pendingNow = rows.filter((r) => r.status === 'pending').reduce((t, r) => t + Number(r.amount), 0);

  function exportCsv() {
    downloadCsv(`payout-statement-${year}.csv`, ['Date', 'Job', 'Amount', 'Status', 'Reference'],
      inYear.map((r) => [day(when(r)), r.referrals?.prospect_name ?? '', Number(r.amount).toFixed(2), r.status, r.reference ?? '']));
  }

  return (
    <section className="print-area surface p-6">
      <div className="hidden print:block"><p className="text-lg font-bold">Window Tune-Up Co. · Referral payout statement</p><p className="text-sm">{partner.name} · {year} · generated {new Date().toLocaleDateString('en-CA')}</p></div>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Payout statement</h2>
        <div className="flex items-center gap-2">
          <select className="field !mt-0 !w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Statement year">{years.map((y) => <option key={y}>{y}</option>)}</select>
          <button className="btn-secondary !py-2 text-xs" onClick={exportCsv} disabled={!inYear.length}><Download size={14} /> CSV</button>
          <button className="btn-secondary !py-2 text-xs" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-800">Paid in {year}</p><p className="text-xl font-bold text-emerald-900">{money(paid)}</p></div>
        <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-800">Pending now (owed to you)</p><p className="text-xl font-bold text-amber-900">{money(pendingNow)}</p></div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-4 overflow-x-auto">
        {inYear.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No payouts in {year}.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-4">Date</th><th className="pr-4">Job</th><th className="pr-4">Amount</th><th className="pr-4">Status</th><th>Reference</th></tr></thead>
            <tbody>{inYear.map((r) => (
              <tr key={r.id} className="border-t border-slate-100"><td className="py-2 pr-4 whitespace-nowrap">{day(when(r))}</td><td className="pr-4">{r.referrals?.prospect_name ?? '—'}</td><td className="pr-4 tabular-nums">{money(Number(r.amount))}</td><td className="pr-4 capitalize">{r.status}</td><td className="text-slate-500">{r.reference ?? ''}</td></tr>))}</tbody>
          </table>
        )}
      </div>
    </section>
  );
}
