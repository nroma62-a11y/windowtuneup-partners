import { useEffect, useState } from 'react';
import LoginModal from './components/LoginModal';
import PartnerPortal from './components/PartnerPortal';
import AdminBoard from './components/AdminBoard';
import ChangePassword from './components/ChangePassword';
import PublicReferral from './components/PublicReferral';
import { isSupabaseConfigured, Partner, supabase } from './lib/supabase';

export default function App() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) { setChecking(false); return; }
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await resolveUser(session.user.id);
      if (alive) setChecking(false);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setTimeout(() => resolveUser(session.user.id), 0);
      else setPartner(null);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  // Every signed-in user must have an active row in `partners`; otherwise they are signed back out.
  async function resolveUser(id: string) {
    const { data, error: lookupError } = await supabase.from('partners').select('*').eq('id', id).maybeSingle();
    if (lookupError) { setError('Unable to verify your partner access. Contact an administrator.'); return; }
    if (!data) { setError('This account is not set up for partner access. Contact an administrator.'); await supabase.auth.signOut(); return; }
    if (data.role !== 'admin' && data.role !== 'partner') { setError('Your account does not have an authorized role.'); await supabase.auth.signOut(); return; }
    if (data.active === false) { setError('This account has been deactivated. Contact an administrator.'); await supabase.auth.signOut(); return; }
    setError('');
    setPartner(data as Partner);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPartner(null);
  }

  // /r/<code> is the public referral page: no login, handled before any session logic.
  if (/^\/r\/[^/]+/.test(window.location.pathname)) return <PublicReferral />;
  if (checking) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Checking secure session…</div>;
  if (!partner) return <>
    <LoginModal />
    {error && <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 rounded-xl bg-red-50 p-4 text-sm text-red-800 shadow-lg">{error}</div>}
  </>;
  if (partner.must_change_password) return <ChangePassword name={partner.name} onDone={() => setPartner({ ...partner, must_change_password: false })} onSignOut={signOut} />;
  // Role check is deliberately centralized; partners never receive the AdminBoard component.
  return partner.role === 'admin' ? <AdminBoard partner={partner} onSignOut={signOut} /> : <PartnerPortal partner={partner} onSignOut={signOut} />;
}
