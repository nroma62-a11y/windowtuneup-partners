/**
 * POST /.netlify/functions/request-partner   (public: the requester has no account)
 *   { name, email, phone?, business?, message?, website }   website = honeypot, must be empty
 *
 * This is NOT a signup. It only records a request for an admin to review.
 */
const { reply, clean, validEmail, sb, smsRoman } = require('../lib/server');

const PER_EMAIL_PER_DAY = 3;
const GLOBAL_PER_HOUR = 30;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(204, {});
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    if (clean(body.website, 50)) return reply(200, { ok: true }); // bots get a fake success

    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phone = clean(body.phone, 30) || null;
    const business = clean(body.business, 150) || null;
    const message = clean(body.message, 1000) || null;
    if (name.length < 2) return reply(422, { error: 'Please enter your name.' });
    if (!validEmail(email)) return reply(422, { error: 'Please enter a valid email.' });

    const since = (ms) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
    const mine = await sb(`/rest/v1/partner_requests?email=eq.${encodeURIComponent(email)}&created_at=gte.${since(864e5)}&select=id`);
    const recent = await sb(`/rest/v1/partner_requests?created_at=gte.${since(36e5)}&select=id`);
    if (mine.length >= PER_EMAIL_PER_DAY || recent.length >= GLOBAL_PER_HOUR) {
      return reply(429, { error: 'Too many requests right now. Please try again later.' });
    }

    await sb('/rest/v1/partner_requests', { method: 'POST', body: { name, email, phone, business, message } });
    await smsRoman(`New partner request: ${name}${business ? ` (${business})` : ''}. Review it in Referral Pro.`);
    return reply(200, { ok: true });
  } catch (e) {
    console.error('request-partner', e.message);
    return reply(e.status === 500 ? 500 : 400, { error: 'Could not send your request. Please try again.' });
  }
};

