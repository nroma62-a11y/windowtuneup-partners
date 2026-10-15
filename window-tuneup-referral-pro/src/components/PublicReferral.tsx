import { FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, Send, Wrench } from 'lucide-react';
import AddressInput from './AddressInput';
import { formatPhone, isCompletePhone } from '../lib/format';

/** Public page at /r/<partner-code>. No login: the code in the link credits the lead to that partner. */
export default function PublicReferral() {
  const ref = useMemo(() => decodeURIComponent(window.location.pathname.split('/')[2] ?? ''), []);
  const openedAt = useMemo(() => Date.now(), []);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setFieldErrors({});
    if (!isCompletePhone(form.phone)) return setFieldErrors({ phone: 'Enter a 10-digit cell phone number.' });
    if (!consent) return setFieldErrors({ consent: 'Please confirm the customer expects our call.' });
    setBusy(true);
    try {
      const res = await fetch('/.netlify/functions/submit-referral', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, name: form.name, phone: form.phone, address: form.address, notes: form.notes, consent, website: form.website, t: openedAt })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return setDone(true);
      if (res.status === 422 && data.fields) return setFieldErrors(data.fields);
      setError(res.status === 404 ? 'This referral link is not active. Please ask for a new one.' : data.error || 'Something went wrong. Please try again.');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  const fe = (k: string) => fieldErrors[k] && <p className="mt-1 text-xs font-normal text-red-700">{fieldErrors[k]}</p>;

  return (
    <div className="mx-auto min-h-screen max-w-md px-5 py-10">
      <div className="mb-8 flex items-center gap-3"><span className="rounded-xl bg-brand-blue p-2.5 text-white"><Wrench size={20} /></span><b>Window Tune-Up Co.</b></div>
      {done ? (
        <div className="surface p-8 text-center">
          <span className="mx-auto mb-4 inline-flex rounded-full bg-emerald-50 p-3 text-emerald-700"><CheckCircle2 size={26} /></span>
          <h1 className="text-2xl font-bold">Got it, thank you.</h1>
          <p className="mt-2 text-slate-500">We'll reach out to them within a few days, and your referral is on record.</p>
        </div>
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Know someone who needs a window fixed?</h1>
          <p className="mt-2 text-slate-500">A few details and we'll take it from there. No account needed.</p>
          <form onSubmit={submit} className="surface mt-6 space-y-4 p-6">
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px]" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <label className="block text-sm font-semibold">Their name<input className="field" required autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />{fe('name')}</label>
            <label className="block text-sm font-semibold">Their cell phone<input className="field" required type="tel" inputMode="tel" autoComplete="off" placeholder="(780) 555-0123" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} />{fe('phone')}</label>
            <div className="block text-sm font-semibold"><label htmlFor="pub-address">Property address</label><AddressInput id="pub-address" value={form.address} onChange={(address) => setForm({ ...form, address })} placeholder="Start typing the street address" />{fe('address')}</div>
            <label className="block text-sm font-semibold">What's going on with it? <span className="font-normal text-slate-400">(optional)</span><textarea className="field min-h-20 resize-y" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Foggy glass, drafts, won't lock…" /></label>
            <label className="flex items-start gap-2 text-sm font-normal"><input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>The customer knows I'm passing along their info and expects us to reach out.</span></label>
            {fe('consent')}
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send referral'} <Send size={16} /></button>
          </form>
        </>
      )}
    </div>
  );
}
