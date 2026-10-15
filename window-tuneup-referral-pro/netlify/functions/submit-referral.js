/**
 * POST /.netlify/functions/submit-referral   (PUBLIC: the person sending the lead is not logged in)
 *   { ref, name, phone, address, notes?, consent, website, t }
 *   ref     = the partner's share_code from their link (/r/<share_code>)
 *   website = honeypot, must be empty;  t = when the form was opened (ms), to spot instant bots
 *
 * Only a valid, active partner code can create a lead, and the lead is credited to that partner.
 */
const { reply, clean, sb, phone10, formatPhone10, smsRoman } = require('../lib/server');

const MIN_FILL_MS = 2500;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PER_CODE_PER_HOUR = 15;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(204, {});
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    const b = JSON.parse(event.body || '{}');

    // Bots get a fake success so they learn nothing.
    if (clean(b.website, 50)) return reply(200, { ok: true });
    if (Number.isFinite(Number(b.t)) && Date.now() - Number(b.t) < MIN_FILL_MS) return reply(200, { ok: true });

    const ref = clean(b.ref, 80);
    const name = clean(b.name, 120);
    const digits = phone10(b.phone);
    const address = clean(b.address, 250);
    const notes = clean(b.notes, 1000);
    const fields = {};
    if (!ref) fields.ref = 'required';
    if (name.length < 2) fields.name = 'Please enter their name.';
    if (!digits) fields.phone = 'Enter a 10-digit cell phone number.';
    if (address.length < 5) fields.address = 'Please enter the property address.';
    if (b.consent !== true) fields.consent = 'Please confirm the customer expects our call.';
    if (Object.keys(fields).length) return reply(422, { error: 'validation', fields });

    const partners = await sb(`/rest/v1/partners?share_code=eq.${encodeURIComponent(ref)}&role=eq.partner&active=eq.true&select=id,name`);
    if (!partners.length) return reply(404, { error: 'unknown_link' });
    const partner = partners[0];

    const since = (ms) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
    const phone = formatPhone10(digits);

    // Same partner sending the same phone number twice in a day is a double-tap, not a new lead.
    const dup = await sb(`/rest/v1/referrals?partner_id=eq.${partner.id}&prospect_phone=eq.${encodeURIComponent(phone)}&created_at=gte.${since(DUPLICATE_WINDOW_MS)}&select=id`);
    if (dup.length) return reply(200, { ok: true });

    const recent = await sb(`/rest/v1/referrals?partner_id=eq.${partner.id}&source=eq.public_link&created_at=gte.${since(36e5)}&select=id`);
    if (recent.length >= MAX_PER_CODE_PER_HOUR) return reply(429, { error: 'Too many referrals right now. Please try again later.' });

    const created = await sb('/rest/v1/referrals', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        partner_id: partner.id, prospect_name: name, prospect_phone: phone, property_address: address,
        notes: notes || null, status: 'new', customer_consent: true, source: 'public_link'
      }
    });

    const isDuplicate = Array.isArray(created) && created[0] && created[0].duplicate_of;
    await smsRoman(isDuplicate
      ? `Possible duplicate referral from ${partner.name}: ${name}, ${address}. Review it in Referral Pro.`
      : `New referral from ${partner.name}: ${name}, ${address}. Open Referral Pro to follow up.`);
    return reply(200, { ok: true });
  } catch (e) {
    console.error('submit-referral', e.message);
    return reply(500, { error: 'Could not send the referral. Please try again.' });
  }
};
