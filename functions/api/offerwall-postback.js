function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  left = left.toLowerCase();
  right = right.toLowerCase();
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...signature].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validDecimal(value, maxDecimals) {
  const pattern = new RegExp("^-?\\d{1,10}(?:\\.\\d{1," + maxDecimals + "})?$");
  return pattern.test(value);
}

export async function onRequestPost({ request, env }) {
  const secretKey = String(env.OFFERWALL_SECRET_KEY || "");
  const base = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!secretKey || !base || !serviceKey) {
    return json(503, { error: "পোস্টব্যাক সার্ভারের নিরাপদ কনফিগারেশন সম্পূর্ণ নয়।" });
  }

  try {
    const parsedBase = new URL(base);
    if (parsedBase.protocol !== "https:" || !parsedBase.hostname.endsWith(".supabase.co")) return json(503, { error: "Supabase server configuration is invalid." });
  } catch {
    return json(503, { error: "Supabase server configuration is invalid." });
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(contentType)) {
    return json(415, { error: "Offerwall callback অবশ্যই POST form হিসেবে পাঠাতে হবে।" });
  }

  let raw;
  try {
    raw = await request.text();
    if (raw.length > 8192) return json(413, { error: "পোস্টব্যাক তথ্য অনেক বড়।" });
  } catch {
    return json(400, { error: "পোস্টব্যাক তথ্য পড়া যায়নি।" });
  }

  const form = new URLSearchParams(raw);
  const userId = String(form.get("userId") || "");
  const transactionId = String(form.get("transactionId") || "");
  const amountText = String(form.get("currencyAmount") || "");
  const status = String(form.get("status") || "");
  const signature = String(form.get("signature") || "");
  const currencyName = String(form.get("currencyName") || "");
  const test = form.get("test") === "1";

  if (!validUuid(userId) || !/^[a-zA-Z0-9._:-]{1,64}$/.test(transactionId)) {
    return json(400, { error: "সদস্য বা transaction ID সঠিক নয়।" });
  }
  if (!["credited", "reversed"].includes(status) || !validDecimal(amountText, 4)) {
    return json(400, { error: "পোস্টব্যাকের অবস্থা বা টাকার পরিমাণ সঠিক নয়।" });
  }
  if (currencyName.toUpperCase() !== "BDT") {
    return json(400, { error: "Offerwall placement-এর currency অবশ্যই BDT হতে হবে।" });
  }
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || (status === "credited" && amount <= 0) || (status === "reversed" && amount >= 0)) {
    return json(400, { error: "পোস্টব্যাকের টাকার চিহ্ন সঠিক নয়।" });
  }

  const expected = await hmacHex(secretKey, userId + ":" + transactionId + ":" + amountText);
  if (!safeEqualHex(signature, expected)) return json(403, { error: "পোস্টব্যাক signature যাচাই হয়নি।" });

  const payoutUsdText = String(form.get("payoutUsd") || "0");
  const payoutUsd = validDecimal(payoutUsdText, 6) ? Number(payoutUsdText) : 0;
  const payload = {
    p_user_id: userId,
    p_transaction_id: transactionId,
    p_amount: amount,
    p_status: status,
    p_offer_id: String(form.get("offerId") || "").slice(0, 120),
    p_offer_name: String(form.get("offerName") || "").slice(0, 240),
    p_currency_name: "BDT",
    p_payout_usd: Number.isFinite(payoutUsd) ? payoutUsd : 0,
    p_test: test
  };

  try {
    const response = await fetch(base + "/rest/v1/rpc/offerwall_gg_process_postback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return json(503, { error: "পোস্টব্যাক নিরাপদে সংরক্ষণ করা যায়নি।" });
    const result = await response.json();
    return new Response("OK", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  } catch {
    return json(503, { error: "পোস্টব্যাক সংরক্ষণে সাময়িক সমস্যা হচ্ছে।" });
  }
}
