const allowedOrigin = (origin) => {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "earnstationbd.pages.dev" || url.hostname.endsWith(".earnstationbd.pages.dev")) return origin;
    return null;
  } catch { return null; }
};

function response(request, status, payload) {
  const origin = allowedOrigin(request.headers.get("Origin"));
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

function base64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encryptPayoutAccount(account, encodedKey) {
  const rawKey = decodeBase64(encodedKey || "");
  if (rawKey.length !== 32) throw new Error("সার্ভারের এনক্রিপশন কনফিগারেশন সঠিক নয়।");
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, new TextEncoder().encode(account)));
  const tag = encrypted.slice(encrypted.length - 16);
  const ciphertext = encrypted.slice(0, encrypted.length - 16);
  const packed = new Uint8Array(iv.length + tag.length + ciphertext.length);
  packed.set(iv, 0);
  packed.set(tag, iv.length);
  packed.set(ciphertext, iv.length + tag.length);
  return "v1." + base64(packed);
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return response(request, 204, null);
  if (request.method !== "POST") return response(request, 405, { error: "এই অনুরোধের পদ্ধতি অনুমোদিত নয়।" });

  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigin(origin)) return response(request, 403, { error: "এই ওয়েবসাইট থেকে অনুরোধ অনুমোদিত নয়।" });

  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\\s+\\S+$/i.test(authorization)) return response(request, 401, { error: "আবার লগইন করুন।" });

  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\\/$/, "");
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  const encryptionKey = env.PAYOUT_ENCRYPTION_KEY;
  if (!supabaseUrl || !supabaseKey || !encryptionKey) return response(request, 503, { error: "সার্ভারের নিরাপদ কনফিগারেশন এখনো সম্পূর্ণ নয়।" });

  let input;
  try {
    if (Number(request.headers.get("Content-Length") || 0) > 4096) return response(request, 413, { error: "অনুরোধটি অনেক বড়।" });
    input = await request.json();
  } catch {
    return response(request, 400, { error: "সঠিক তথ্য পাঠান।" });
  }

  const method = input.method;
  const account = String(input.account || "").replace(/\\D/g, "");
  const amount = Number(input.amount);
  if (!["bkash", "nagad"].includes(method)) return response(request, 400, { error: "বিকাশ অথবা নগদ নির্বাচন করুন।" });
  if (!/^01[3-9]\\d{8}$/.test(account)) return response(request, 400, { error: "সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।" });
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
    return response(request, 400, { error: "সঠিক উত্তোলনের পরিমাণ লিখুন।" });
  }

  try {
    const userResponse = await fetch(supabaseUrl + "/auth/v1/user", {
      headers: { apikey: supabaseKey, Authorization: authorization }
    });
    if (!userResponse.ok) return response(request, 401, { error: "আবার লগইন করুন।" });

    const ciphertext = await encryptPayoutAccount(account, encryptionKey);
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
    return response(request, 200, {
      success: true,
      request_id: raw,
      message: "উত্তোলনের অনুরোধ জমা হয়েছে। সর্বোচ্চ ৫ ঘণ্টার মধ্যে পেমেন্ট সম্পন্ন করা হবে।"
    });
  } catch (error) {
    return response(request, 503, { error: error.message || "নিরাপদ সার্ভারে অনুরোধ সম্পন্ন করা যায়নি।" });
  }
}
