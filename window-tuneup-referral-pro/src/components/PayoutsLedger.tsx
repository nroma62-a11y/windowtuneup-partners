import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Row = {
  id: string; amount: number; status: 'pending' | 'paid' | 'cancelled'; paid_at: string | null;
  reference: string | null; created_at: string; partners: { name: string } | null; referrals: { prospect_name: string } | null;
};
const money = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-CA') : '');
// Spreadsheets run text that starts with = + - @ as a formula, so defuse those cells in the export.
const cell = (v: string | number) => { const s = String(v ?? ''); return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };

/** Read-only payout ledger for the admin: who is owed, who was paid, what was cancelled. */
export default function PayoutsLedger() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('all');
  const [who, setWho] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.from('payouts').select('*, partners(name), referrals(prospect_name)').order('created_at', { ascending: false }).limit(1000)
      .then(({ data, error: e }) => { if (!alive) return; if (e) setError(e.message); else setRows((data ?? []) as unknown as Row[]); });
    return () => { alive = false; };
  }, []);

  const partners = useMemo(() => [...new Set(rows.map((r) => r.partners?.name ?? 'Unknown'))].sort(), [rows]);
  const shown = rows.filter((r) => (status === 'all' || r.status === status) && (who === 'all' || (r.partners?.name ?? 'Unknown') === who));
  const sum = (s: Row['status']) => shown.filter((r) => r.status === s).reduce((t, r) => t + Number(r.amount), 0);

  function exportCsv() {
    const head = ['Created', 'Partner', 'Job', 'Amount', 'Status', 'Paid on', 'Reference'];
    const lines = shown.map((r) => [day(r.created_at), r.partners?.name ?? '', r.referrals?.prospect_name ?? '', Number(r.amount).toFixed(2), r.status, day(r.paid_at), r.reference ?? ''].map(cell).join(','));
    const url = URL.createObjectURL(new Blob([[head.map(cell).join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `payouts-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <section className="surface mt-8 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">Payouts</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field !mt-0 !w-auto" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by partner"><option value="all">All partners</option>{partners.map((p) => <option key={p}>{p}</option>)}</select>
          <select className="field !mt-0 !w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select>
          <button className="btn-secondary !py-2 text-xs" onClick={exportCsv} disabled={!shown.length}><Download size={14} /> Export CSV</button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-800">Pending (owed)</p><p className="text-xl font-bold text-amber-900">{money(sum('pending'))}</p></div>
        <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-800">Paid</p><p className="text-xl font-bold text-emerald-900">{money(sum('paid'))}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Cancelled</p><p className="text-xl font-bold text-slate-700">{money(sum('cancelled'))}</p></div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-4 overflow-x-auto">
        {shown.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No payouts to show.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-4">Date</th><th className="pr-4">Partner</th><th className="pr-4">Job</th><th className="pr-4">Amount</th><th className="pr-4">Status</th><th>Reference</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2 pr-4 whitespace-nowrap">{day(r.status === 'paid' ? r.paid_at : r.created_at)}</td>
                <td className="pr-4">{r.partners?.name ?? '—'}</td><td className="pr-4">{r.referrals?.prospect_name ?? '—'}</td>
                <td className="pr-4 tabular-nums">{money(Number(r.amount))}</td>
                <td className="pr-4"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : r.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{r.status}</span></td>
                <td className="text-slate-500">{r.reference ?? ''}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </section>
  );
}
