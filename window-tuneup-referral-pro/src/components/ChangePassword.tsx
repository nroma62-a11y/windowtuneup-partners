import { FormEvent, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Props = { name: string; onDone: () => void; onSignOut: () => void };

export default function ChangePassword({ name, onDone, onSignOut }: Props) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 12) return setError('Use at least 12 characters.');
    if (pw !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: pw });
    if (updateError) { setBusy(false); return setError(updateError.message); }
    const { error: flagError } = await supabase.rpc('clear_must_change_password');
    setBusy(false);
    if (flagError) return setError('Password changed, but we could not finish setup. Sign out and back in.');
    onDone();
  }

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <form onSubmit={submit} className="surface w-full max-w-md space-y-4 p-8">
        <span className="inline-flex rounded-xl bg-blue-50 p-3 text-brand-blue"><KeyRound size={24} /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Choose your own password</h1>
          <p className="mt-2 text-sm text-slate-500">Welcome, {name}. Replace the temporary password you were given before continuing.</p>
        </div>
        <label className="block text-sm font-semibold">New password
          <input className="field" type="password" autoComplete="new-password" required minLength={12} value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label className="block text-sm font-semibold">Confirm new password
          <input className="field" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save password and continue'}</button>
        <button type="button" className="w-full text-center text-xs text-slate-400 hover:text-slate-600" onClick={onSignOut}>Sign out</button>
      </form>
    </div>
  );
}
