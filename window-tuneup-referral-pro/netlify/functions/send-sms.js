/**
 * Netlify Function: POST /.netlify/functions/send-sms
 * Server-side only: keep Twilio and service-role secrets in Netlify environment variables.
 *
 * Supported event types:
 *   welcome  { prospectName, prospectPhone }
 *   sales_alert { prospectName, prospectPhone, propertyAddress, notes }
 *   partner_payout { partnerName, partnerPhone, jobValue, commissionAmount }
 *   inspection_confirmation { prospectName, prospectPhone, inspectionAt, propertyAddress }
 *
 * Protect this endpoint before production use. It expects an authenticated caller and validates
 * an Authorization bearer token against Supabase Auth. Configure allowed callers in your app.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://partner.windowtuneup.ca',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, ROMAN_ALERT_PHONE } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return reply(500, { error: 'Server auth is not configured' });
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { error: 'Authorization required' });
  try {
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` } });
    if (!authResponse.ok) return reply(401, { error: 'Invalid session' });
    const user = await authResponse.json();
    const body = JSON.parse(event.body || '{}');
    const { type } = body;
    const allowed = ['welcome', 'sales_alert', 'partner_payout', 'inspection_confirmation'];
    if (!allowed.includes(type)) return reply(400, { error: 'Unsupported SMS event type' });
    // Verify the caller has an admin role for sensitive notification triggers.
    const partnerResponse = await fetch(`${SUPABASE_URL}/rest/v1/partners?id=eq.${encodeURIComponent(user.id)}&select=role`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } });
    const partners = await partnerResponse.json();
    if (!partnerResponse.ok || !partners.some(p => p.role === 'admin')) return reply(403, { error: 'Admin role required' });
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) return reply(500, { error: 'Twilio is not configured' });
    const messages = [];
    if (type === 'welcome') {
      required(body, ['prospectName', 'prospectPhone']);
      messages.push({ to: body.prospectPhone, body: `Hi ${body.prospectName}, thanks for connecting with Window Tune-Up Co.! Mention this referral for $50 off your window tune-up. We'll be in touch soon.` });
    } else if (type === 'sales_alert') {
      required(body, ['prospectName', 'prospectPhone', 'propertyAddress']);
      if (!ROMAN_ALERT_PHONE) return reply(500, { error: 'ROMAN_ALERT_PHONE is not configured' });
      messages.push({ to: ROMAN_ALERT_PHONE, body: `New referral: ${body.prospectName}, ${body.prospectPhone}, ${body.propertyAddress}. Notes: ${body.notes || 'None'}` });
    } else if (type === 'partner_payout') {
      required(body, ['partnerName', 'partnerPhone', 'commissionAmount']);
      messages.push({ to: body.partnerPhone, body: `Great news, ${body.partnerName}! A Window Tune-Up Co. referral job is complete. Your commission is $${Number(body.commissionAmount).toFixed(2)}. Thank you for partnering with us!` });
    } else {
      required(body, ['prospectName', 'prospectPhone', 'inspectionAt', 'propertyAddress']);
      messages.push({ to: body.prospectPhone, body: `Hi ${body.prospectName}, your Window Tune-Up Co. inspection is scheduled for ${body.inspectionAt} at ${body.propertyAddress}. Reply to this message if you need to make a change.` });
    }
    const results = [];
    for (const message of messages) {
      const form = new URLSearchParams({ To: message.to, From: TWILIO_PHONE_NUMBER, Body: message.body });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form
      });
      const result = await response.json();
      if (!response.ok) return reply(502, { error: 'Twilio send failed', details: result.message || 'Provider error' });
      results.push({ sid: result.sid, status: result.status });
    }
    return reply(200, { ok: true, results });
  } catch (error) {
    return reply(400, { error: error.message || 'Invalid request' });
  }
};
function required(obj, keys) { for (const key of keys) if (obj[key] == null || String(obj[key]).trim() === '') throw new Error(`Missing required field: ${key}`); }
function reply(statusCode, body) { return { statusCode, headers: corsHeaders, body: JSON.stringify(body) }; }
