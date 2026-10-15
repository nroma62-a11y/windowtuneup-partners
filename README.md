# Window Tune-Up Co. Referral Pro

A React 18 + TypeScript + Vite + Tailwind CSS referral-management starter for Netlify and Supabase. It includes partner and admin workspaces, Supabase RLS schema, QR share links, and a Twilio-backed Netlify Function.

> **Production note:** This is a deployable application foundation, not a fully audited production service. Configure the Supabase project, environment secrets, SMS trigger calls, Google Places, and business processes before inviting real partners. Never rely on UI role checks alone; database RLS is the security boundary.

## Requirements

- Node.js 20+
- A Supabase project
- Netlify account/site
- Optional Twilio account for SMS
- Optional Google Maps JavaScript API + Places API key

## Local setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase project URL and anon key
npm run dev
```

## Supabase setup

1. Open Supabase SQL Editor and run `schema.sql`, then `schema-commission.sql` (per-partner commission rates), then `schema-completed.sql` and `schema-job-commission.sql` (the Completed stage; a commission you can set per job while it is quoted), then `schema-public-referral.sql` (the public referral page), then `schema-duplicates.sql` (duplicate referral rule: the first partner to refer a customer keeps the credit for 90 days; flagged duplicates wait in an admin review queue), then `schema-cancel.sql` (cancel a lost lead or a sale that falls through, and reopen), then **last** `schema-pay-on-complete.sql` (commission is calculated on the server, shows as pending when a job is sold, and is recorded as paid when the job is marked completed). Run the files in this order.
2. **Invite-only access.** After `schema.sql`, run `schema-invite-only.sql`. In Authentication → Sign In / Providers: turn OFF "Allow new users to sign up", and disable Email OTP/magic link and the Google, Apple, and Azure providers. Keep the Email provider enabled (it powers username + password) and set a minimum password length of 12. Nobody can create their own account; admins invite partners from the app.
3. Add `http://localhost:5173` and `https://partner.windowtuneup.ca` to Supabase Auth URL configuration.
4. **Create your own admin account once, by hand** (partners are invited from the app, but the first admin can't be): in Authentication → Users, add a user with email `partner+YOURUSERNAME@windowtuneup.ca` (use your chosen username) and a strong password, tick auto-confirm, then run:
   `insert into public.partners (id, name, email, role, share_code, username, must_change_password) values ('<that user's UUID>', 'Roman', 'hello@windowtuneup.ca', 'admin', 'windowtuneup', 'YOURUSERNAME', false);`
   Turn on MFA for this account. After that, invite every partner from Admin → Invite a partner.
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in local `.env.local` and Netlify build environment.
6. Test with at least one admin and one partner account. Attempt direct API access as a partner to confirm RLS denies admin-wide reads/updates.

### Google address autocomplete

The property address field suggests Canadian addresses as partners type (nearby Edmonton ranked first) using Google's Places API (New). To turn it on:

1. In Google Cloud, create a project, enable billing, and enable **Maps JavaScript API** and **Places API (New)**.
2. Create an API key. Restrict it to HTTP referrers `https://partner.windowtuneup.ca/*` and `http://localhost:5173/*`, and restrict it to those two APIs. The key is visible in the browser by design, so these restrictions are what protect it.
3. Set `VITE_GOOGLE_MAPS_API_KEY` in `.env.local` and in Netlify's build environment, then redeploy.

Without a key the field is an ordinary text box, so the form still works. Google bills autocomplete after a free monthly allowance: set a budget alert in Google Cloud, and check Google's current pricing and attribution terms.

### Netlify deployment

1. Connect the repository or upload this project to Netlify.
2. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_LOGIN_EMAIL_DOMAIN` (use `windowtuneup.ca`) at build time.
3. Set server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ROMAN_ALERT_PHONE`, `LOGIN_EMAIL_DOMAIN` (same value as above), and optionally `ALLOWED_ORIGIN` in Netlify environment variables. Never prefix secrets with `VITE_`.
4. Deploy. `netlify.toml` configures SPA fallback and `/r/*` routes.
5. Add `partner.windowtuneup.ca` as a Netlify custom domain and update DNS/TLS settings.

## Reports, payout statements, and passwords

- **Reports** (admin, below the pipeline): leads received, conversion (sold / leads), sales, average job value, commission as a percentage of sales, and cancellations, for this month, 30 or 90 days, this year, or all time, with a per-partner table and CSV export. Figures group leads by the date they were received. Duplicates are left out, and a cancelled sale's commission is not counted.
- **Payout statement** (partner dashboard): a partner's own payouts by year with paid and pending totals, CSV export, and Print / PDF. Only their own payouts load, enforced by the database.
- **Change password** (partner and admin): checks the current password, then requires 12 or more characters.

## Public referral page

`/r/<share_code>` is a login-free page where anyone with a partner's link or QR code can send a lead. Each partner's link and QR code are on their dashboard. The page posts to `netlify/functions/submit-referral`, which checks the code belongs to an active partner, requires the consent checkbox, ignores bots (hidden field, instant-submit check), caps 15 referrals per partner per hour, and credits the lead to that partner. Run `schema-public-referral.sql` first. If `ROMAN_ALERT_PHONE` and the Twilio variables are set, new referrals text you.

## SMS function

Endpoint: `POST /.netlify/functions/send-sms`, with a Supabase access token in `Authorization: Bearer <token>`. JSON examples:

```json
{ "type": "welcome", "prospectName": "Taylor", "prospectPhone": "+17805550142" }
{ "type": "sales_alert", "prospectName": "Taylor", "prospectPhone": "+17805550142", "propertyAddress": "Edmonton, AB", "notes": "Drafty windows" }
{ "type": "inspection_confirmation", "prospectName": "Taylor", "prospectPhone": "+17805550142", "inspectionAt": "Oct 12, 2026 at 10:00 AM", "propertyAddress": "Edmonton, AB" }
{ "type": "partner_payout", "partnerName": "Jamie", "partnerPhone": "+17805550123", "jobValue": 1800, "commissionAmount": 180 }
```

The function requires an authenticated **admin** caller and server-side secrets. Connect calls from trusted app workflows only. SMS delivery is not currently triggered automatically from the React UI; this is intentional so notification timing, consent, retries, and failures can be implemented and tested rather than silently sending texts. Add idempotency, rate limiting, audit logging, opt-out handling, and consent review before production use. Canadian SMS compliance may require consent and opt-out language.

## Security and operational notes

- Authenticated session is looked up in `partners`; app routes by the verified database role. Partners render only the partner portal.
- RLS policies restrict partners to their own referrals and payouts; only admins can update referrals or manage partner/payout records.
- Commission close-out is an atomic database function that checks admin role and computes/validates 10% commission before crediting pending balance and creating a payout ledger entry.
- The service-role key is used only by Netlify serverless function environment, never in the browser.
- The SMS endpoint is an example production-oriented function, but should be reviewed for rate limits, phone-number validation, audit trails, and abuse protection before launch.
- For strongest hardening, move provisioning to a trusted admin-only server process, enable MFA for administrators, add audit tables, and test all RLS policies with Supabase's policy tester.
- Share links route to the SPA; a referral form opened via `/r/:code` is not yet implemented as a public homeowner form. The current QR opens the share route and can be extended to a public referral landing page.
- Payout balances are displayed from partner balance fields plus referral ledger data; the schema stores individual payout records for auditability.

## Scripts

- `npm run dev` — local development server
- `npm run build` — type-check and production build
- `npm run preview` — preview the production build
