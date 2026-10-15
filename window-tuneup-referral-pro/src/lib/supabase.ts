import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR_PROJECT'));
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

export type PartnerRole = 'admin' | 'partner';
export type Partner = {
  id: string; name: string; email: string; phone: string | null; role: PartnerRole;
  share_code: string; total_paid: number; pending_payout: number;
  username?: string | null; active?: boolean; must_change_password?: boolean;
  commission_type?: 'percent' | 'fixed'; commission_value?: number;
};
export type ReferralStatus = 'new' | 'contacted' | 'inspection_scheduled' | 'quoted' | 'purchased' | 'completed' | 'cancelled' | 'closed';
export type Referral = {
  id: string; partner_id: string; prospect_name: string; prospect_phone: string;
  property_address: string; notes: string | null; status: ReferralStatus;
  final_job_value: number | null; commission_amount: number | null; invoice_number?: string | null;
  commission_type?: 'percent' | 'fixed' | null; commission_value?: number | null;
  cancel_reason?: string | null; duplicate_of?: string | null; duplicate_resolution?: 'kept_original' | 'credited_new' | 'promoted' | null;
  created_at: string; inspection_at?: string | null;
};
export const statusLabel: Record<ReferralStatus, string> = {
  new: 'New Lead', contacted: 'Contacted', inspection_scheduled: 'Inspection Booked',
  quoted: 'Quoted', purchased: 'Purchased', completed: 'Completed', cancelled: 'Cancelled', closed: 'Closed'
};