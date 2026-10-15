const crypto = require('crypto');

const LOGIN_EMAIL_DOMAIN = process.env.LOGIN_EMAIL_DOMAIN || 'windowtuneup.ca';
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://partner.windowtuneup.ca',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
const reply = (statusCode, body) => ({ statusCode, headers: corsHeaders, body: JSON.stringify(body) });
const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

// Partners sign in with a username. Supabase Auth needs an email, so each username maps to an
// internal address. It must match src/lib/identity.ts. "partner+" can never collide with a
// real mailbox, and nothing is ever emailed to it (accounts are created pre-confirmed).
const loginEmail = (username) => `partner+${username}@${LOGIN_EMAIL_DOMAIN}`;

const normalizeUsername = (raw) => clean(raw, 40).toLowerCase().replace(/[^a-z0-9._-]/g, '');
const validUsername = (u) => /^[a-z0-9._-]{3,32}$/.test(u);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** 10 digits from any North American input, or null. Area codes never start with 1. */
function phone10(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? d : null;
}
const formatPhone10 = (d) => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;

/** Best-effort text to the owner. Never throws: an alert failing must not lose a lead or request. */
async function smsRoman(body) {
  try {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, ROMAN_ALERT_PHONE } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !ROMAN_ALERT_PHONE) return;
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ To: ROMAN_ALERT_PHONE, From: TWILIO_PHONE_NUMBER, Body: body })
    });
  } catch (e) { console.error('sms alert failed', e.message); }
}

/** 14 chars from an unambiguous alphabet (no 0/O, 1/l/I). ~80 bits of entropy. */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 14; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

const suggestUsername = (name) => {
  const base = normalizeUsername(String(name).split(/\s+/).join('.')) || 'partner';
  return (base.length >= 3 ? base : base + '.pro').slice(0, 26);
};

function env() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw Object.assign(new Error('Server is not configured'), { status: 500 });
  return { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY };
}

/** Service-role call to PostgREST (/rest/v1) or GoTrue admin (/auth/v1). */
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = env();
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error)) || `Request failed (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return data;
}

/** Verifies the bearer token and that the caller is an ACTIVE admin. Returns the auth user. */
async function requireAdmin(event) {
  const { url, key } = env();
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Authorization required'), { status: 401 });
  const authRes = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!authRes.ok) throw Object.assign(new Error('Invalid session'), { status: 401 });
  const user = await authRes.json();
  const rows = await sb(`/rest/v1/partners?id=eq.${encodeURIComponent(user.id)}&select=role,active`);
  if (!rows.some((p) => p.role === 'admin' && p.active)) throw Object.assign(new Error('Admin role required'), { status: 403 });
  return user;
}

module.exports = {
  corsHeaders, reply, clean, loginEmail, normalizeUsername, validUsername, validEmail,
  generatePassword, suggestUsername, sb, requireAdmin, phone10, formatPhone10, smsRoman
};
