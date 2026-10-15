import { useCallback, useEffect, useState } from 'react';
import { supabase, statusLabel, ReferralStatus } from '../lib/supabase';

type Dup = {
  id: string; prospect_name: string; prospect_phone: string; property_address: string; created_at: string;
  partners: { name: string } | null;
  original: { status: ReferralStatus; created_at: string; prospect_name: string; partners: { name: string } | null } | null;
};
const SOLD: ReferralStatus[] = ['purchased', 'completed', 'closed', 'cancelled'];
const day = (d: string) => new Date(d).toLocaleDateString('en-CA');

/** Queue of referrals flagged as duplicates of an earlier lead. Shows nothing when the queue is empty. */
export default function DuplicatesReview({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<Dup[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('referrals')
      .select('id, prospect_name, prospect_phone, property_address, created_at, partners(name), original:referrals!duplicate_of(status, created_at, prospect_name, partners(name))')
      .not('duplicate_of', 'is', null).is('duplicate_resolution', null).order('created_at', { ascending: true });
    if (e) setError(e.message); else setItems((data ?? []) as unknown as Dup[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function resolve(id: string, action: 'keep' | 'credit_new' | 'promote') {
    setError('');
    const { error: e } = await supabase.rpc('resolve_duplicate', { p_referral_id: id, p_action: action });
    if (e) return setError(e.message);
    await load(); onChanged();
  }

  if (!items.length && !error) return null;
  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
      <h2 className="font-bold text-amber-900">Possible duplicate referrals <span className="ml-1 rounded-lg bg-white px-2 py-0.5 text-xs">{items.length}</span></h2>
      <p className="mt-1 text-sm text-amber-900/80">These match a customer who was already referred in the last 90 days. By default the first partner keeps the credit.</p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-4 space-y-3">
        {items.map((d) => {
          const locked = !d.original || SOLD.includes(d.original.status);
          return (
            <div key={d.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">New submission · {day(d.created_at)}</p><p className="font-semibold">{d.partners?.name ?? 'Unknown'}</p><p>{d.prospect_name} · {d.prospect_phone}</p><p className="text-slate-500">{d.property_address}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Already in the system · {d.original ? day(d.original.created_at) : ''}</p><p className="font-semibold">{d.original?.partners?.name ?? 'Unknown'}</p><p>{d.original?.prospect_name} · {d.original ? statusLabel[d.original.status] : ''}</p></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary !py-2 text-xs" onClick={() => resolve(d.id, 'keep')}>Keep original partner</button>
                <button className="btn-secondary !py-2 text-xs" disabled={locked} title={locked ? 'The original is already sold, completed, or cancelled' : undefined} onClick={() => resolve(d.id, 'credit_new')}>Credit {d.partners?.name ?? 'new partner'} instead</button>
                <button className="btn-secondary !py-2 text-xs" onClick={() => resolve(d.id, 'promote')}>Treat as a new lead</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
