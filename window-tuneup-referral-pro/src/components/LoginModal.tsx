import { FormEvent, useState } from 'react';
import { ArrowRight, ShieldCheck, Wrench } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { loginEmail } from '../lib/identity';
import { formatPhone } from '../lib/format';

const emptyRequest = { name: '', email: '', phone: '', business: '', message: '', website: '' };

export default function LoginModal() {
  const [mode, setMode] = useState<'login' | 'request' | 'sent'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [req, setReq] = useState(emptyRequest);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function signIn(e: FormEvent) {
    e.preventDefault(); setMessage('');
    if (!isSupabaseConfigured) return setMessage('Add your Supabase URL and anon key to .env.local to enable sign-in.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(username), password });
    setBusy(false);
    // One generic message: never reveal whether the username exists.
    if (error) setMessage('Incorrect username or password.');
  }

  async function sendRequest(e: FormEvent) {
    e.preventDefault(); setMessage(''); setBusy(true);
    try {
      const res = await fetch('/.netlify/functions/request-partner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setReq(emptyRequest); setMode('sent'); }
      else setMessage(data.error || 'Could not send your request. Please try again.');
    } catch {
      setMessage('Could not reach the server. Check your connection and try again.');
    }
    setBusy(false);
  }

  const set = (k: keyof typeof emptyRequest) => (e: { target: { value: string } }) => setReq({ ...req, [k]: e.target.value });

  return <div className="min-h-screen grid lg:grid-cols-2 bg-white">
    <section className="hidden lg:flex flex-col justify-between bg-slate-950 p-12 text-white relative overflow-hidden">
      <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-blue-600/30 blur-3xl" />
      <div className="flex items-center gap-3 relative"><span className="rounded-xl bg-brand-blue p-3"><Wrench size={24}/></span><div><p className="font-bold tracking-tight">WINDOW TUNE-UP CO.</p><p className="text-xs text-slate-400">REFERRAL PRO</p></div></div>
      <div className="relative max-w-lg"><p className="mb-4 text-sm font-bold uppercase tracking-[.2em] text-blue-300">Better windows. Better partnerships.</p><h1 className="text-5xl font-bold leading-tight">Turn trusted connections into rewards.</h1><p className="mt-5 text-lg leading-8 text-slate-300">Send a referral, follow every milestone, and see your earnings in one simple place.</p></div>
      <p className="relative text-sm text-slate-500">Edmonton &amp; Area · Don’t Replace, Tune it up.</p>
    </section>

    <section className="flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center gap-3 lg:hidden"><span className="rounded-xl bg-brand-blue p-3 text-white"><Wrench/></span><div className="font-bold">Window Tune-Up Co.<p className="text-xs font-medium text-slate-500">Referral Pro</p></div></div>

        {mode === 'login' && <>
          <div className="mb-8"><div className="mb-4 inline-flex rounded-xl bg-blue-50 p-3 text-brand-blue"><ShieldCheck size={25}/></div><h2 className="text-3xl font-bold tracking-tight">Partner sign in</h2><p className="mt-2 text-slate-500">Access is by invitation. Use the username and password we gave you.</p></div>
          <form onSubmit={signIn} className="space-y-4">
            <label className="block text-sm font-semibold">Username<input className="field" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)}/></label>
            <label className="block text-sm font-semibold">Password<input className="field" type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16}/></button>
          </form>
          {message && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{message}</p>}
          <div className="mt-8 rounded-xl bg-slate-50 p-4 text-center"><p className="text-sm font-semibold">Not a partner yet?</p><p className="mt-1 text-xs text-slate-500">Contractors, realtors, and property pros can ask to join.</p><button className="btn-secondary mt-3 w-full" onClick={()=>{setMessage('');setMode('request')}}>Request to become a partner</button></div>
        </>}

        {mode === 'request' && <>
          <div className="mb-6"><h2 className="text-3xl font-bold tracking-tight">Request to become a partner</h2><p className="mt-2 text-slate-500">Tell us a little about you. We review every request and will contact you if it’s a fit.</p></div>
          <form onSubmit={sendRequest} className="space-y-4">
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px]" value={req.website} onChange={set('website')}/>
            <label className="block text-sm font-semibold">Your name<input className="field" required value={req.name} onChange={set('name')}/></label>
            <label className="block text-sm font-semibold">Email<input className="field" type="email" required value={req.email} onChange={set('email')}/></label>
            <label className="block text-sm font-semibold">Phone <span className="font-normal text-slate-400">(optional)</span><input className="field" type="tel" inputMode="tel" autoComplete="off" placeholder="(780) 555-0123" value={req.phone} onChange={e=>setReq({...req,phone:formatPhone(e.target.value)})}/></label>
            <label className="block text-sm font-semibold">Business or trade <span className="font-normal text-slate-400">(optional)</span><input className="field" placeholder="Window cleaning, realty, property management…" value={req.business} onChange={set('business')}/></label>
            <label className="block text-sm font-semibold">Anything else? <span className="font-normal text-slate-400">(optional)</span><textarea className="field min-h-20 resize-y" value={req.message} onChange={set('message')}/></label>
            {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{message}</p>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
            <button type="button" className="w-full text-center text-sm text-slate-500 hover:text-slate-700" onClick={()=>{setMessage('');setMode('login')}}>Back to sign in</button>
          </form>
        </>}

        {mode === 'sent' && <div className="text-center">
          <div className="mx-auto mb-4 inline-flex rounded-full bg-emerald-50 p-4 text-emerald-700"><ShieldCheck size={28}/></div>
          <h2 className="text-2xl font-bold">Request received</h2>
          <p className="mt-2 text-slate-500">Thanks. If we’d like to move forward, we’ll reach out with your username and password.</p>
          <button className="btn-secondary mt-6" onClick={()=>setMode('login')}>Back to sign in</button>
        </div>}

        <p className="mt-8 text-center text-xs leading-5 text-slate-400">Secure access · Partner data is private by default</p>
      </div>
    </section>
  </div>;
}
