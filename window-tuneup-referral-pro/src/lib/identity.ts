// Partners sign in with a username; Supabase Auth needs an email, so each username maps to an
// internal address. Must match netlify/lib/server.js. Nothing is ever emailed to it.
const DOMAIN = (import.meta.env.VITE_LOGIN_EMAIL_DOMAIN as string | undefined) || 'windowtuneup.ca';

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();
export const loginEmail = (username: string) => `partner+${normalizeUsername(username)}@${DOMAIN}`;
