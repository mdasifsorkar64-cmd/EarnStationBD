import { encryptPayoutAccount } from "../_shared/payout-crypto.js";
import { getSupabaseConfig } from "../_shared/supabase-config.js";

function allowedOrigin(origin, requestUrl) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return null;
    if (url.origin === new URL(requestUrl).origin) return origin;
    if (url.hostname === "earnstationbd.pages.dev" || url.hostname.endsWith(".earnstationbd.pages.dev")) return origin;
    return null;
  } catch { return null; }
}

function reply(request, status, payload) {
  const origin = allowedOrigin(request.headers.get("Origin"), request.url);
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return new Response(payload === null ? null : JSON.stringify(payload), { status, headers });
}

export async function onRequestOptions({ request }) {
  if (request.headers.get("Origin") && !allowedOrigin(request.headers.get("Origin"), request.url)) {
    return reply(request, 403, { error: "এই ওয়েবসাইট থেকে অনুরোধ অনুমোদিত নয়।" });
  }
  return reply(request, 204, null);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigin(origin, request.url)) {
    return reply(request, 403, { error: "এই ওয়েবসাইট থেকে অনুরোধ অনুমোদিত নয়।" });
  }

  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return reply(request, 401, { error: "আবার লগইন করুন।" });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
    return reply(request, 415, { error: "সঠিক JSON তথ্য পাঠান।" });
  }

  try {
    const { base, apiKey } = getSupabaseConfig(env);
    const encryptionKey = env.PAYOUT_ENCRYPTION_KEY;
    if (!base || !apiKey || !encryptionKey) {
      return reply(request, 503, { error: "সার্ভারের নিরাপদ কনফিগারেশন এখনো সম্পূর্ণ নয়।" });
    }
    const parsedUrl = new URL(base);
    if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".supabase.co")) {
      return reply(request, 503, { error: "সার্ভারের কনফিগারেশন সঠিক নয়।" });
    }

    let input;
    try {
      const raw = await request.text();
      if (raw.length > 4096) return reply(request, 413, { error: "অনুরোধটি অনেক বড়।" });
      input = JSON.parse(raw);
    } catch {
      return reply(request, 400, { error: "সঠিক তথ্য পাঠান।" });
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return reply(request, 400, { error: "সঠিক তথ্য পাঠান।" });
    }

    const method = input.method;
    const accountInput = String(input.account || "").trim();
    const account = accountInput.replace(/[ -]/g, "");
    const amount = Number(input.amount);
    if (!["bkash", "nagad"].includes(method)) return reply(request, 400, { error: "বিকাশ অথবা নগদ নির্বাচন করুন।" });
    if (!/^01[3-9]\d{8}$/.test(account)) return reply(request, 400, { error: "সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।" });
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
      return reply(request, 400, { error: "সঠিক উত্তোলনের পরিমাণ লিখুন।" });
    }

    const ciphertext = await encryptPayoutAccount(account, encryptionKey);
    const response = await fetch(base + "/rest/v1/rpc/request_withdrawal", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey, Authorization: authorization },
      body: JSON.stringify({ p_amount: amount, p_method: method, p_account_ciphertext: ciphertext })
    });
    const raw = await response.text();
    if (!response.ok) {
      let message = "উত্তোলনের অনুরোধ গ্রহণ করা যায়নি।";
      try {
        const error = JSON.parse(raw);
        const detail = String(error.message || "");
        if (/insufficient available balance/i.test(detail)) message = "আপনার উত্তোলনযোগ্য ব্যালেন্সের চেয়ে বেশি টাকা চাওয়া হয়েছে।";
        else if (/authentication required|jwt expired|invalid jwt/i.test(detail)) message = "আপনার লগইন সেশন শেষ হয়েছে। আবার লগইন করুন।";
        else if (/withdrawal.*(once|day)|already.*withdraw|আজ একবার উইথড্র|দিনে মাত্র ১ বার/i.test(detail)) message = "আপনি আজকের উত্তোলনের সীমা ব্যবহার করেছেন। আগামীকাল আবার চেষ্টা করুন।";
        else if (/minimum withdrawal/i.test(detail)) message = "আপনার চাওয়া টাকার পরিমাণ সর্বনিম্ন উত্তোলনের সীমার চেয়ে কম।";
        else if (/08:00|20:00|উইথড্রের সময় সকাল ৮টা/i.test(detail)) message = "বাংলাদেশ সময় সকাল ৮টা থেকে রাত ৮টার মধ্যে উত্তোলনের অনুরোধ করুন।";
        else if (/invalid amount/i.test(detail)) message = "সঠিক উত্তোলনের পরিমাণ লিখুন।";
        else if (/unsupported payout method/i.test(detail)) message = "বিকাশ অথবা নগদ নির্বাচন করুন।";
      } catch {}
      const safeStatus = response.status === 401 ? 401
        : response.status === 403 ? 403
        : response.status === 429 ? 429
        : response.status >= 500 ? 503 : 400;
      return reply(request, safeStatus, { error: message });
    }

    let requestId = null;
    try { requestId = JSON.parse(raw); } catch {}
    return reply(request, 200, {
      success: true,
      request_id: typeof requestId === "string" ? requestId : null,
      message: "উত্তোলনের অনুরোধ জমা হয়েছে। অ্যাডমিন যাচাই করে পেমেন্ট করবেন। ৫ ঘণ্টার মধ্যে সম্পন্ন না হলে অনুরোধের টাকা স্বয়ংক্রিয়ভাবে ফেরত যাবে।"
    });
  } catch {
    return reply(request, 503, { error: "নিরাপদ সার্ভারে সাময়িক সমস্যা হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।" });
  }
}
