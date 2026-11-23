import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://mdasifsorkar64-cmd.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (origin !== "https://mdasifsorkar64-cmd.github.io") {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const bearer = req.headers.get("Authorization");
  if (!bearer?.startsWith("Bearer ")) {
    return json({ error: "Login required" }, 401);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  if (action !== "list_members") {
    return json({ error: "Unsupported action" }, 400);
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !anonKey || !serviceKey) {
    return json({ error: "Server configuration missing" }, 500);
  }

  const token = bearer.slice("Bearer ".length);
  const authClient = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const adminClient = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role, account_status")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) return json({ error: "Admin verification failed" }, 500);
  if (profile?.role !== "admin" || profile.account_status !== "active") {
    return json({ error: "Admin access denied" }, 403);
  }

  const { data: members, error: membersError } = await adminClient
    .from("profiles")
    .select("id, full_name, phone, role, account_status, created_at, referral_code, referred_by")
    .order("created_at", { ascending: false })
    .limit(100);

  if (membersError) return json({ error: "Member list could not be loaded" }, 500);
  return json({ members: members ?? [], count: members?.length ?? 0, limit: 100 });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
