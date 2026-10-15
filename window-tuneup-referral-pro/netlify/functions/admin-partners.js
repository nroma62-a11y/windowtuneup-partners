/**
 * POST /.netlify/functions/admin-partners   (admin session required)
 *   { action: 'create', name, email, phone?, username?, requestId? }
 *   { action: 'reset',  partnerId }
 *
 * Returns the generated password ONCE in the response. It is never stored or logged anywhere,
 * so the admin UI shows it a single time for you to pass on.
 */
const crypto = require('crypto');
const {
  reply, clean, loginEmail, normalizeUsername, validUsername, validEmail,
  generatePassword, suggestUsername, sb, requireAdmin
} = require('../lib/server');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(204, {});
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    await requireAdmin(event);
    const body = JSON.parse(event.body || '{}');
    if (body.action === 'create') return reply(200, await createPartner(body));
    if (body.action === 'reset') return reply(200, await resetPassword(body));
    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    return reply(e.status || 400, { error: e.message || 'Invalid request' });
  }
};

async function createPartner(body) {
  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 30) || null;
  const commissionType = body.commission_type === 'fixed' ? 'fixed' : 'percent';
  const commissionValue = Number(body.commission_value ?? 10);
  if (!Number.isFinite(commissionValue) || commissionValue < 0 || (commissionType === 'percent' && commissionValue > 100)) {
    throw Object.assign(new Error('Commission must be 0 to 100 percent, or a fixed amount of 0 or more'), { status: 422 });
  }
  if (name.length < 2) throw Object.assign(new Error('Name is required'), { status: 422 });
  if (!validEmail(email)) throw Object.assign(new Error('A valid contact email is required'), { status: 422 });

  const emailTaken = await sb(`/rest/v1/partners?email=eq.${encodeURIComponent(email)}&select=id`);
  if (emailTaken.length) throw Object.assign(new Error('A partner with that email already exists'), { status: 409 });

  // Username: use the one given (must be free), or suggest one from the name and add digits if taken.
  const wanted = normalizeUsername(body.username);
  let username = wanted || suggestUsername(name);
  if (!validUsername(username)) throw Object.assign(new Error('Username must be 3-32 characters: letters, numbers, . _ -'), { status: 422 });
  const isFree = async (u) => !(await sb(`/rest/v1/partners?username=eq.${encodeURIComponent(u)}&select=id`)).length;
  if (!(await isFree(username))) {
    if (wanted) throw Object.assign(new Error('That username is taken'), { status: 409 });
    let n = 2;
    while (!(await isFree(`${username}${n}`))) n++;
    username = `${username}${n}`;
  }

  const password = generatePassword();
  const authUser = await sb('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: loginEmail(username), password, email_confirm: true, user_metadata: { name } }
  });

  const shareCode = `${username}-${crypto.randomBytes(2).toString('hex')}`;
  try {
    await sb('/rest/v1/partners', {
      method: 'POST',
      body: { id: authUser.id, name, email, phone, role: 'partner', username, share_code: shareCode, must_change_password: true,
        commission_type: commissionType, commission_value: commissionValue }
    });
  } catch (e) {
    await sb(`/auth/v1/admin/users/${authUser.id}`, { method: 'DELETE' }).catch(() => {}); // no orphan login
    throw e;
  }

  if (body.requestId) {
    await sb(`/rest/v1/partner_requests?id=eq.${encodeURIComponent(String(body.requestId))}`, {
      method: 'PATCH', body: { status: 'approved' }
    }).catch(() => {});
  }
  return { ok: true, partnerId: authUser.id, username, password, shareCode };
}

async function resetPassword(body) {
  const id = clean(body.partnerId, 60);
  const rows = await sb(`/rest/v1/partners?id=eq.${encodeURIComponent(id)}&role=eq.partner&select=id,username`);
  if (!rows.length) throw Object.assign(new Error('Partner not found'), { status: 404 });
  const password = generatePassword();
  await sb(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: { password } });
  await sb(`/rest/v1/partners?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { must_change_password: true } });
  return { ok: true, partnerId: id, username: rows[0].username, password };
}
