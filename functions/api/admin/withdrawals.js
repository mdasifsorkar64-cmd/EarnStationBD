const allowedOrigin = (origin) => {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && (url.hostname === "earnstationbd.pages.dev" || url.hostname.endsWith(".earnstationbd.pages.dev"))) return origin;
    return null;
  } catch { return null; }
};

function reply(request, status, payload) {
  const origin = allowedOrigin(request.headers.get("Origin"));
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  }
  return new Response(payload === null ? null : JSON.stringify(payload), { status, headers });
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decryptPayoutAccount(value, encodedKey) {
  const [version, encoded] = String(value || "").split(".");
  if (version !== "v1" || !encoded) throw new Error("উত্তোলনের গোপন তথ্য পড়া যায়নি।");
  const packed = fromBase64(encoded);
  if (packed.length < 29) throw new Error("উত্তোলনের গোপন তথ্য সঠিক নয়।");
  const rawKey = fromBase64(encodedKey || "");
  if (rawKey.length !== 32) throw new Error("সার্ভারের এনক্রিপশন কনফিগারেশন সঠিক নয়।");
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const iv = packed.slice(0, 12);
  const tag = packed.slice(12, 28);
  const ciphertext = packed.slice(28);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, combined);
  return new TextDecoder().decode(clear);
}

async function requireAdmin(base, apiKey, authorization) {
  const userResponse = await fetch(base + "/auth/v1/user", { headers: { apikey: apiKey, Authorization: authorization } });
  if (!userResponse.ok) throw new Error("আবার লগইন করুন।");
  const user = await userResponse.json();
  const profileResponse = await fetch(base + "/rest/v1/profiles?id=eq." + encodeURIComponent(user.id) + "&select=role,account_status", {
    headers: { apikey: apiKey, Authorization: authorization }
  });
  const profiles = await profileResponse.json();
  if (!profileResponse.ok || !profiles[0] || profiles[0].role !== "admin" || profiles[0].account_status !== "active") {
    throw new Error("সক্রিয় অ্যাডমিন অনুমতি নেই।");
  }
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return reply(request, 204, null);
  if (!["GET", "POST"].includes(request.method)) return reply(request, 405, { error: "এই অনুরোধের পদ্ধতি অনুমোদিত নয়।" });
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigin(origin)) return reply(request, 403, { error: "এই ওয়েবসাইট থেকে অনুরোধ অনুমোদিত নয়।" });

  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(request, 401, { error: "আবার লগইন করুন।" });
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const apiKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  const encryptionKey = env.PAYOUT_ENCRYPTION_KEY;
  if (!base || !apiKey || !encryptionKey) return reply(request, 503, { error: "সার্ভারের নিরাপদ কনফিগারেশন এখনো সম্পূর্ণ নয়।" });

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
      if (Number(request.headers.get("Content-Length") || 0) > 2048) return reply(request, 413, { error: "অনুরোধটি অনেক বড়।" });
      input = await request.json();
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
