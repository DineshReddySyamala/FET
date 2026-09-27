// ==========================================================================
// SUPABASE CLIENT SINGLETON
// ==========================================================================
const SUPABASE_URL = 'https://rijewldflpcdhhpirzob.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NEtjbMlk3XjDxHJtaRiOdw_NZIPpFH3';

const createSupabase = window.supabase?.createClient || window.createClient;
window.db = createSupabase(SUPABASE_URL, SUPABASE_KEY);