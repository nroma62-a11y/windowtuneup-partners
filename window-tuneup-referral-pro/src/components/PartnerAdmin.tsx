import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, UserPlus } from 'lucide-react';
import { Partner, supabase } from '../lib/supabase';
import { describeCommission } from '../lib/commission';
import { formatPhone } from '../lib/format';

type PartnerRequest = { id: string; name: string; email: string; phone: string | null; business: string | null; message: string | null; created_at: string };
type Credentials = { name: string; username: string; password: string };
const blank = { name: '', email: '', phone: '', username: '', requestId: '', ctype: 'percent', cvalue: '10' };
const money = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

async function callAdmin(payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/admin-partners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function PartnerAdmin() {
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [form, setForm] = useState(blank);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ type: 'percent', value: '10' });

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([
      supabase.from('partner_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('partners').select('*').eq('role', 'partner').order('name')
    ]);
    if (r.data) setRequests(r.data as PartnerRequest[]);
    if (p.data) setPartners(p.data as Partner[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault(); setNotice(''); setCreds(null); setBusy(true);
    try {
      const out = await callAdmin({ action: 'create', ...form, commission_type: form.ctype, commission_value: Number(form.cvalue), requestId: form.requestId || undefined });
      setCreds({ name: form.name, username: out.username, password: out.password });
      setForm(blank); await load();
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Could not create the partner.'); }
    setBusy(false);
  }

  async function reset(p: Partner) {
    if (!window.confirm(`Reset the password for ${p.name}? Their current password stops working.`)) return;
    setNotice(''); setCreds(null);
    try {
      const out = await callAdmin({ action: 'reset', partnerId: p.id });
      setCreds({ name: p.name, username: out.username, password: out.password });
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Could not reset the password.'); }
  }

  async function decline(id: string) {
    const { error } = await supabase.from('partner_requests').update({ status: 'declined' }).eq('id', id);
    if (error) return setNotice(error.message);
    setRequests((rs) => rs.filter((r) => r.id !== id));
  }

  async function setActive(p: Partner, active: boolean) {
    const { error } = await supabase.from('partners').update({ active }).eq('id', p.id);
    if (error) return setNotice(error.message);
    setPartners((ps) => ps.map((x) => (x.id === p.id ? { ...x, active } : x)));
  }

  async function saveCommission(p: Partner) {
    const value = Number(edit.value);
    if (!Number.isFinite(value) || value < 0 || (edit.type === 'percent' && value > 100)) return setNotice('Enter a valid commission (a percentage must be between 0 and 100).');
    const { error } = await supabase.from('partners').update({ commission_type: edit.type, commission_value: value }).eq('id', p.id);
    if (error) return setNotice(error.message);
    setPartners((ps) => ps.map((x) => (x.id === p.id ? { ...x, commission_type: edit.type as 'percent' | 'fixed', commission_value: value } : x)));
    setEditing(null); setNotice('');
  }

  async function copyInvite() {
    if (!creds) return;
    const text = `Hi ${creds.name.split(' ')[0]}, you're set up as a Window Tune-Up Co. referral partner.\nSign in at ${window.location.origin}\nUsername: ${creds.username}\nPassword: ${creds.password}\nYou'll be asked to choose your own password the first time.`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setNotice('Could not copy. Select the details above and copy them by hand.'); }
  }

  return <div className="mt-8 grid gap-6 lg:grid-cols-2">
    <section className="surface p-5">
      <h2 className="flex items-center gap-2 font-bold"><UserPlus size={18}/> Invite a partner</h2>
      <p className="mt-1 text-sm text-slate-500">Creates their account with a generated password. You’ll see it once, then pass it on.</p>
      <form onSubmit={create} className="mt-4 space-y-3">
        <label className="block text-sm font-semibold">Name<input className="field" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label className="block text-sm font-semibold">Contact email<input className="field" type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Phone <span className="font-normal text-slate-400">(optional)</span><input className="field" type="tel" inputMode="tel" autoComplete="off" placeholder="(780) 555-0123" value={form.phone} onChange={e=>setForm({...form,phone:formatPhone(e.target.value)})}/></label>
          <label className="block text-sm font-semibold">Username <span className="font-normal text-slate-400">(auto if blank)</span><input className="field" autoCapitalize="none" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Commission type<select className="field" value={form.ctype} onChange={e=>setForm({...form,ctype:e.target.value})}><option value="percent">Percent of job value</option><option value="fixed">Fixed amount per job</option></select></label>
          <label className="block text-sm font-semibold">{form.ctype==='percent'?'Percent (%)':'Amount per job ($)'}<input className="field" type="number" min="0" max={form.ctype==='percent'?100:undefined} step="0.01" required value={form.cvalue} onChange={e=>setForm({...form,cvalue:e.target.value})}/></label>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create partner account'}</button>
      </form>
      {notice && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{notice}</p>}
      {creds && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-bold text-emerald-900">Credentials for {creds.name} (shown once)</p>
        <p className="mt-2 font-mono text-sm">Username: {creds.username}</p>
        <p className="font-mono text-sm">Password: {creds.password}</p>
        <button className="btn-secondary mt-3 w-full" onClick={copyInvite}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : 'Copy message to send them'}</button>
      </div>}
    </section>

    <section className="surface p-5">
      <h2 className="font-bold">Partner requests <span className="ml-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs">{requests.length}</span></h2>
      {requests.length === 0 ? <p className="mt-3 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">No pending requests.</p> :
        <div className="mt-3 space-y-3">{requests.map(r => <div key={r.id} className="rounded-xl border border-slate-100 p-4">
          <p className="font-semibold">{r.name}{r.business && <span className="font-normal text-slate-500"> · {r.business}</span>}</p>
          <p className="text-xs text-slate-500">{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
          {r.message && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{r.message}</p>}
          <div className="mt-3 flex gap-2">
            <button className="btn-primary !py-2 text-xs" onClick={()=>{setForm({...blank,name:r.name,email:r.email,phone:r.phone??'',requestId:r.id});setCreds(null);setNotice('')}}>Review &amp; invite</button>
            <button className="btn-secondary !py-2 text-xs" onClick={()=>decline(r.id)}>Decline</button>
          </div></div>)}</div>}
    </section>

    <section className="surface p-5 lg:col-span-2">
      <h2 className="font-bold">Partners <span className="ml-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs">{partners.length}</span></h2>
      {partners.length === 0 ? <p className="mt-3 text-sm text-slate-500">No partners yet.</p> :
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{partners.map(p => <div key={p.id} className={`rounded-xl border border-slate-100 p-3 ${p.active === false ? 'opacity-60' : ''}`}>
          <p className="font-semibold">{p.name}{p.active === false && <span className="ml-2 text-xs font-normal text-red-600">Deactivated</span>}</p>
          <p className="text-xs text-slate-500">@{p.username ?? '—'} · {p.email}</p>
          <p className="mt-2 text-xs">Paid out: {money(Number(p.total_paid || 0))} · Pending: {money(Number(p.pending_payout || 0))}</p>
          <p className="mt-1 text-xs">Commission: <b>{describeCommission(p)}</b> <button className="ml-1 text-brand-blue underline" onClick={()=>{setEditing(p.id);setEdit({type:p.commission_type??'percent',value:String(p.commission_value??10)})}}>Edit</button></p>
          {editing===p.id&&<div className="mt-2 flex flex-wrap items-center gap-2"><select className="field !mt-0 !w-auto" value={edit.type} onChange={e=>setEdit({...edit,type:e.target.value})}><option value="percent">% of job</option><option value="fixed">Fixed $</option></select><input className="field !mt-0 !w-24" type="number" min="0" step="0.01" value={edit.value} onChange={e=>setEdit({...edit,value:e.target.value})}/><button className="btn-primary !px-3 !py-1.5 text-xs" onClick={()=>saveCommission(p)}>Save</button><button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={()=>setEditing(null)}>Cancel</button></div>}
          <div className="mt-3 flex gap-2">
            <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={()=>reset(p)}><KeyRound size={13}/> Reset password</button>
            <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={()=>setActive(p, p.active === false)}>{p.active === false ? 'Reactivate' : 'Deactivate'}</button>
          </div></div>)}</div>}
    </section>
  </div>;
}
