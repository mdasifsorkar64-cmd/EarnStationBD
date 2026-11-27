export function getSupabaseConfig(env) {
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const apiKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  return { base, apiKey };
}
