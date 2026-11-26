import { encryptPayoutAccount } from "../_shared/payout-crypto.js";

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

function response(request, status, payload) {
  const origin = allowedOrigin(request.headers.get("Origin"), request.url);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return new Response(payload === null ? null : JSON.stringify(payload), { status, headers });
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return response(request, 204, null);
  if (request.method !== "POST") return response(request, 405, { error: "এই অনুরোধের পদ্ধতি অনুমোদিত নয়।" });

  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigin(origin, request.url)) return response(request, 403, { error: "এই ওয়েবসাইট থেকে অনুরোধ অনুমোদিত নয়।" });

  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return response(request, 401, { error: "আবার লগইন করুন।" });

  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  const encryptionKey = env.PAYOUT_ENCRYPTION_KEY;
  if (!supabaseUrl || !supabaseKey || !encryptionKey) return response(request, 503, { error: "সার্ভারের নিরাপদ কনফিগারেশন এখনো সম্পূর্ণ নয়।" });
  try { const parsed = new URL(supabaseUrl); if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) throw new Error(); } catch { return response(request, 503, { error: "Supabase URL কনফিগারেশন সঠিক নয়।" }); }


  let input;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return response(request, 413, { error: "অনুরোধটি অনেক বড়।" });
    input = JSON.parse(raw);
  } catch {
    return response(request, 400, { error: "সঠিক তথ্য পাঠান।" });
  }

  const method = input.method;
  const account = String(input.account || "").replace(/\D/g, "");
  const amount = Number(input.amount);
  if (!["bkash", "nagad"].includes(method)) return response(request, 400, { error: "বিকাশ অথবা নগদ নির্বাচন করুন।" });
  if (!/^01[3-9]\d{8}$/.test(account)) return response(request, 400, { error: "সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।" });
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
    return response(request, 400, { error: "সঠিক উত্তোলনের পরিমাণ লিখুন।" });
  }

  try {
    const ciphertext = await encryptPayoutAccount(account, encryptionKey);
    const userResponse = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: supabaseKey, Authorization: authorization }
    });
    if (!userResponse.ok) {
      const authError = await userResponse.clone().json().catch(() => ({}));
      const authMessage = String(authError.message || authError.msg || "");
      if (/invalid api key|api key.*invalid/i.test(authMessage)) {
        return response(request, 503, { error: "Supabase API key কনফিগারেশন সঠিক নয়।" });
      }
      return response(request, 401, { error: "আবার লগইন করুন।" });
    }

    const result = await fetch(supabaseUrl + "/rest/v1/rpc/request_withdrawal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: authorization
      },
      body: JSON.stringify({ p_amount: amount, p_method: method, p_account_ciphertext: ciphertext })
    });
    const raw = await result.text();
    if (!result.ok) {
      let message = "উত্তোলনের অনুরোধ গ্রহণ করা যায়নি।";
      try {
        const parsed = JSON.parse(raw);
        if (parsed.message === "Insufficient available balance") message = "আপনার উত্তোলনযোগ্য ব্যালেন্সের চেয়ে বেশি টাকা চাওয়া হয়েছে।";
        else if (parsed.message === "withdrawals_paused") message = "বর্তমানে নতুন উত্তোলনের আবেদন গ্রহণ বন্ধ রয়েছে।";
        else if (parsed.message) message = parsed.message;
      } catch {}
      return response(request, result.status === 401 ? 401 : 400, { error: message });
    }
    let requestId = raw;
    try { requestId = JSON.parse(raw); } catch {}
    return response(request, 200, {
      success: true,
      request_id: requestId,
      message: "উত্তোলনের অনুরোধ জমা হয়েছে। সর্বোচ্চ ৫ ঘণ্টার মধ্যে পেমেন্ট সম্পন্ন করা হবে।"
    });
  } catch (error) {
    return response(request, 503, { error: error.message || "নিরাপদ সার্ভারে অনুরোধ সম্পন্ন করা যায়নি।" });
  }
}
