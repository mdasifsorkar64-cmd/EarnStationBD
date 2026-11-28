import { getSupabaseConfig } from "../_shared/supabase-config.js";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...signature].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet({ request, env }) {
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json(401, { error: "আবার লগইন করুন।" });

  const { base, apiKey } = getSupabaseConfig(env);
  const publicKey = String(env.OFFERWALL_PUBLIC_KEY || "").trim();
  const secretKey = String(env.OFFERWALL_SECRET_KEY || "");
  if (!base || !apiKey || !publicKey || !secretKey) {
    return json(503, { error: "Offerwall.GG সংযোগ এখনো প্রস্তুত নয়। প্রকাশক অ্যাকাউন্টের API key ও secret সেট করতে হবে।" });
  }
  if (!/^[a-f0-9]{32}$/i.test(publicKey)) return json(503, { error: "Offerwall.GG-এর public key সঠিক নয়।" });

  try {
    const authResponse = await fetch(base + "/auth/v1/user", {
      headers: { apikey: apiKey, Authorization: authorization }
    });
    if (!authResponse.ok) return json(401, { error: "লগইন সেশন যাচাই করা যায়নি। আবার লগইন করুন।" });
    const user = await authResponse.json();
    if (!user || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(user.id || ""))) {
      return json(401, { error: "সদস্য পরিচয় যাচাই করা যায়নি।" });
    }
    const profileResponse = await fetch(base + "/rest/v1/profiles?id=eq." + encodeURIComponent(user.id) + "&select=role,account_status", {
      headers: { apikey: apiKey, Authorization: authorization }
    });
    if (!profileResponse.ok) return json(403, { error: "সদস্য অ্যাকাউন্ট যাচাই করা যায়নি।" });
    const profiles = await profileResponse.json();
    if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0].role !== "member" || profiles[0].account_status !== "active") {
      return json(403, { error: "এই অ্যাকাউন্টে Offerwall ব্যবহার অনুমোদিত নয়।" });
    }

    const canonical = "appId=" + publicKey + "&userId=" + user.id;
    const signature = await hmacHex(secretKey, canonical);
    const wallUrl = "https://offerwall.gg/wall/" + publicKey +
      "?userId=" + encodeURIComponent(user.id) + "&signature=" + signature;
    return json(200, { wall_url: wallUrl });
  } catch {
    return json(503, { error: "Offerwall.GG সংযোগে সাময়িক সমস্যা হচ্ছে।" });
  }
}
