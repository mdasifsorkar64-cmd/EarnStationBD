import { decryptPayoutAccount } from "../../_shared/payout-crypto.js";
import { getSupabaseConfig } from "../../_shared/supabase-config.js";

const allowedOrigin = (origin, requestUrl) => {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return null;
    if (requestUrl && url.origin === new URL(requestUrl).origin) return origin;
    if (url.hostname === "earnstationbd.pages.dev" || url.hostname.endsWith(".earnstationbd.pages.dev")) return origin;
    return null;
  } catch { return null; }
};

function reply(request, status, payload) {
  const origin = allowedOrigin(request.headers.get("Origin"), request.url);
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  }
  return new Response(payload === null ? null : JSON.stringify(payload), { status, headers });
}

async function requireAdmin(base, apiKey, authorization) {
  const userResponse = await fetch(base + "/auth/v1/user", { headers: { apikey: apiKey, Authorization: authorization } });
  if (!userResponse.ok) throw new Error("আবার লগইন করুন।");

  // Use the database's canonical admin check, including the email allowlist.
  const adminResponse = await fetch(base + "/rest/v1/rpc/is_admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey, Authorization: authorization },
    body: "{}"
  });
  if (!adminResponse.ok) throw new Error("অ্যাডমিন অনুমতি যাচাই করা যায়নি।");
  const isAdmin = await adminResponse.json();
  if (isAdmin !== true) throw new Error("সক্রিয় অ্যাডমিন অনুমতি নেই।");
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return reply(request, 204, null);
  if (!["GET", "POST"].includes(request.method)) return reply(request, 405, { error: "এই অনুরোধের পদ্ধতি অনুমোদিত নয়।" });
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigin(origin, request.url)) return reply(request, 403, { error: "এই ওয়েবসাইট থেকে অনুরোধ অনুমোদিত নয়।" });

  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(request, 401, { error: "আবার লগইন করুন।" });
  const { base, apiKey } = getSupabaseConfig(env);
  const encryptionKey = env.PAYOUT_ENCRYPTION_KEY;
  if (!base || !apiKey || !encryptionKey) return reply(request, 503, { error: "সার্ভারের নিরাপদ কনফিগারেশন এখনো সম্পূর্ণ নয়।" });
  try { const parsed = new URL(base); if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) throw new Error(); } catch { return reply(request, 503, { error: "Supabase URL কনফিগারেশন সঠিক নয়।" }); }

  try {
    await requireAdmin(base, apiKey, authorization);
    if (request.method === "GET") {
      const headers = { apikey: apiKey, Authorization: authorization };
      const wr = await fetch(base + "/rest/v1/withdrawal_requests?select=id,user_id,amount,payout_method,payout_account_ciphertext,status,is_test,admin_note,created_at,expires_at,paid_at,refunded_at,payment_transaction_id&order=created_at.desc&limit=100", { headers });
      const withdrawals = await wr.json();
      if (!wr.ok) return reply(request, 400, { error: "উইথড্র তালিকা লোড করা যায়নি।" });
      const ids = [...new Set(withdrawals.map(row => row.user_id))];
      let profiles = [];
      if (ids.length) {
        const pr = await fetch(base + "/rest/v1/profiles?select=id,full_name,phone&id=in.(" + ids.join(",") + ")", { headers });
        profiles = await pr.json();
        if (!pr.ok) return reply(request, 400, { error: "সদস্যের তথ্য লোড করা যায়নি।" });
      }
      const byId = new Map(profiles.map(profile => [profile.id, profile]));
      const result = await Promise.all(withdrawals.map(async row => ({
        id: row.id,
        user_id: row.user_id,
        amount: row.amount,
        payout_method: row.payout_method,
        payout_account: await decryptPayoutAccount(row.payout_account_ciphertext, encryptionKey),
        status: row.status,
        is_test: !!row.is_test,
        admin_note: row.admin_note,
        created_at: row.created_at,
        expires_at: row.expires_at,
        paid_at: row.paid_at,
        refunded_at: row.refunded_at,
        payment_transaction_id: row.payment_transaction_id,
        member: byId.get(row.user_id) || {}
      })));
      return reply(request, 200, { withdrawals: result });
    }

    let input;
    try {
      const raw = await request.text();
      if (raw.length > 2048) return reply(request, 413, { error: "অনুরোধটি অনেক বড়।" });
      input = JSON.parse(raw);
    } catch {
      return reply(request, 400, { error: "সঠিক তথ্য পাঠান।" });
    }
    if (!/^[0-9a-f-]{36}$/i.test(String(input.withdrawal_id || ""))) return reply(request, 400, { error: "সঠিক উইথড্র নির্বাচন করুন।" });
    const transactionId = String(input.transaction_id || "").trim();
    if (transactionId.length < 4 || transactionId.length > 100) return reply(request, 400, { error: "৪ থেকে ১০০ অক্ষরের সঠিক Transaction ID লিখুন।" });
    const result = await fetch(base + "/rest/v1/rpc/admin_complete_withdrawal", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey, Authorization: authorization },
      body: JSON.stringify({ p_withdrawal_id: input.withdrawal_id, p_transaction_id: transactionId })
    });
    const raw = await result.text();
    if (!result.ok) {
      let message = "পেমেন্ট স্ট্যাটাস আপডেট করা যায়নি।";
      try { const parsed = JSON.parse(raw); if (parsed.message) message = parsed.message; } catch {}
      return reply(request, 400, { error: message });
    }
    let status = raw;
    try { status = JSON.parse(raw); } catch {}
    return reply(request, 200, { success: true, status });
  } catch (error) {
    return reply(request, 403, { error: error.message || "অ্যাডমিন অনুমোদন যাচাই করা যায়নি।" });
  }
}
