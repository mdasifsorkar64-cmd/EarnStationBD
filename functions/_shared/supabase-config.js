const TEST_SUPABASE_URL = "https://rxfgozophvsriaslifab.supabase.co";
const TEST_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iiYXd1uUy1Rq_Fz5tYg3Tg_rpevuEJc";

export function getSupabaseConfig(request, env) {
  const hostname = new URL(request.url).hostname;
  const isPagesPreview =
    hostname !== "earnstationbd.pages.dev" &&
    hostname.endsWith(".earnstationbd.pages.dev");

  if (isPagesPreview) {
    return {
      base: TEST_SUPABASE_URL,
      apiKey: TEST_SUPABASE_PUBLISHABLE_KEY
    };
  }

  return {
    base: String(env.SUPABASE_URL || "").replace(/\/$/, ""),
    apiKey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY
  };
}
