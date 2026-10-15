import { FormEvent, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { loginEmail } from '../lib/identity';

/** Lets a signed-in user choose a new password. The current password is checked first. */
export default function ChangePasswordCard({ username }: { username?: string | null }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!username) return setMsg({ ok: false, text: 'This account has no username. Ask an administrator.' });
    if (f.next.length < 12) return setMsg({ ok: false, text: 'Use at least 12 characters.' });
    if (f.next !== f.confirm) return setMsg({ ok: false, text: 'The new passwords do not match.' });
    if (f.next === f.current) return setMsg({ ok: false, text: 'Choose a password different from the current one.' });
    setBusy(true);
    const check = await supabase.auth.signInWithPassword({ email: loginEmail(username), password: f.current });
    if (check.error) { setBusy(false); return setMsg({ ok: false, text: 'Your current password is incorrect.' }); }
    const { error } = await supabase.auth.updateUser({ password: f.next });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setF({ current: '', next: '', confirm: '' });
    setMsg({ ok: true, text: 'Password changed.' });
  }

  return (
    <section className="no-print surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold"><KeyRound size={18} /> Account</h2>
        <button className="btn-secondary !py-2 text-xs" onClick={() => { setOpen(!open); setMsg(null); }}>{open ? 'Close' : 'Change password'}</button>
      </div>
      {open && (
        <form onSubmit={submit} className="mt-4 max-w-sm space-y-3">
          <label className="block text-sm font-semibold">Current password<input className="field" type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></label>
          <label className="block text-sm font-semibold">New password (12+ characters)<input className="field" type="password" autoComplete="new-password" required minLength={12} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></label>
          <label className="block text-sm font-semibold">Confirm new password<input className="field" type="password" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></label>
          {msg && <p role="alert" className={`rounded-xl p-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        </form>
      )}
    </section>
  );
}
