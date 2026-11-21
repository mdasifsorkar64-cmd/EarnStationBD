"use strict";
// Local development API. Keep the encryption key only in ~/.earnstationbd.env.
const http = require("node:http");
const crypto = require("node:crypto");

const PORT = Number(process.env.WITHDRAWAL_PORT || 3001);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PAYOUT_ENCRYPTION_KEY = process.env.PAYOUT_ENCRYPTION_KEY;
const BASE = () => SUPABASE_URL.replace(/\/$/, "");

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "http://127.0.0.1:3000",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin"
  });
  res.end(JSON.stringify(body));
}
function encryptionKey() {
  const key = Buffer.from(PAYOUT_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("Invalid encryption key configuration");
  return key;
}
function encryptAccount(account) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(account, "utf8"), cipher.final()]);
  return "v1." + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
function decryptAccount(value) {
  const [version, encoded] = String(value || "").split(".");
  if (version !== "v1" || !encoded) throw new Error("Unsupported payout ciphertext");
  const packed = Buffer.from(encoded, "base64");
  if (packed.length < 29) throw new Error("Invalid payout ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
}
async function requireAdmin(authorization) {
  const userRes = await fetch(BASE() + "/auth/v1/user", {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization }
  });
  if (!userRes.ok) throw new Error("আবার লগইন করুন।");
  const user = await userRes.json();
  const roleRes = await fetch(BASE() + "/rest/v1/profiles?id=eq." + encodeURIComponent(user.id) + "&select=role", {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization }
  });
  const roles = await roleRes.json();
  if (!roleRes.ok || !roles[0] || roles[0].role !== "admin") throw new Error("অ্যাডমিন অনুমতি নেই।");
  return user;
}
async function readBody(req, limit = 4096) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit) throw new Error("অনুরোধটি অনেক বড়।");
  }
  return JSON.parse(raw || "{}");
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const isWithdrawal = req.method === "POST" && req.url === "/api/withdrawal";
  const isAdminList = req.method === "GET" && req.url === "/api/admin/withdrawals";
  const isAdminComplete = req.method === "POST" && req.url === "/api/admin/withdrawals/complete";
  if (!isWithdrawal && !isAdminList && !isAdminComplete) return json(res, 404, { error: "Not found" });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !PAYOUT_ENCRYPTION_KEY) {
    return json(res, 503, { error: "সার্ভারের নিরাপদ কনফিগারেশন এখনো সম্পূর্ণ নয়।" });
  }
  const origin = req.headers.origin;
  if (origin && origin !== "http://127.0.0.1:3000" && origin !== "http://localhost:3000") {
    return json(res, 403, { error: "এই ওয়েবসাইট থেকে অনুরোধ অনুমোদিত নয়।" });
  }
  const authorization = req.headers.authorization || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json(res, 401, { error: "আবার লগইন করুন।" });

  try {
    if (isAdminList || isAdminComplete) {
      await requireAdmin(authorization);
      if (isAdminList) {
        const headers = { apikey: SUPABASE_ANON_KEY, Authorization: authorization };
        const wr = await fetch(BASE() + "/rest/v1/withdrawal_requests?select=id,user_id,amount,payout_method,payout_account_ciphertext,status,is_test,admin_note,created_at,expires_at,paid_at,refunded_at&order=created_at.desc&limit=100", { headers });
        const withdrawals = await wr.json();
        if (!wr.ok) return json(res, 400, { error: "উইথড্র তালিকা লোড করা যায়নি।" });
        const ids = [...new Set(withdrawals.map(x => x.user_id))];
        let profiles = [];
        if (ids.length) {
          const pr = await fetch(BASE() + "/rest/v1/profiles?select=id,full_name,phone&id=in.(" + ids.join(",") + ")", { headers });
          profiles = await pr.json();
          if (!pr.ok) return json(res, 400, { error: "সদস্যের তথ্য লোড করা যায়নি।" });
        }
        const byId = new Map(profiles.map(p => [p.id, p]));
        const result = withdrawals.map(w => ({
          id: w.id, user_id: w.user_id, amount: w.amount, payout_method: w.payout_method,
          payout_account: decryptAccount(w.payout_account_ciphertext), status: w.status, is_test: !!w.is_test,
          admin_note: w.admin_note, created_at: w.created_at, expires_at: w.expires_at,
          paid_at: w.paid_at, refunded_at: w.refunded_at, member: byId.get(w.user_id) || {}
        }));
        return json(res, 200, { withdrawals: result });
      }
      const input = await readBody(req, 2048);
      if (!/^[0-9a-f-]{36}$/i.test(String(input.withdrawal_id || ""))) {
        return json(res, 400, { error: "সঠিক উইথড্র নির্বাচন করুন।" });
      }
      const complete = await fetch(BASE() + "/rest/v1/rpc/admin_complete_withdrawal", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: authorization },
        body: JSON.stringify({ p_withdrawal_id: input.withdrawal_id })
      });
      const responseText = await complete.text();
      if (!complete.ok) return json(res, 400, { error: "পেমেন্ট স্ট্যাটাস আপডেট করা যায়নি।" });
      let status = responseText;
      try { status = JSON.parse(responseText); } catch (_) {}
      return json(res, 200, { success: true, status });
    }

    const input = await readBody(req);
    const method = input.method;
    const account = String(input.account || "").replace(/\D/g, "");
    const amount = Number(input.amount);
    if (!["bkash", "nagad"].includes(method)) return json(res, 400, { error: "বিকাশ অথবা নগদ নির্বাচন করুন।" });
    if (!/^01[3-9]\d{8}$/.test(account)) return json(res, 400, { error: "সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।" });
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
      return json(res, 400, { error: "সঠিক উত্তোলনের পরিমাণ লিখুন।" });
    }
    const response = await fetch(BASE() + "/rest/v1/rpc/request_withdrawal", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: authorization },
      body: JSON.stringify({ p_amount: amount, p_method: method, p_account_ciphertext: encryptAccount(account) })
    });
    const result = await response.text();
    if (!response.ok) {
      let message = "উত্তোলনের অনুরোধ গ্রহণ করা যায়নি।";
      try {
        const parsed = JSON.parse(result);
        if (parsed.message === "Insufficient available balance") message = "আপনার উত্তোলনযোগ্য ব্যালেন্সের চেয়ে বেশি টাকা চাওয়া হয়েছে।";
        else if (parsed.message === "Authentication required") message = "আবার লগইন করুন।";
      } catch (_) {}
      return json(res, response.status === 401 ? 401 : 400, { error: message });
    }
    return json(res, 200, {
      success: true, request_id: result,
      message: "উত্তোলনের অনুরোধ জমা হয়েছে। সর্বোচ্চ ৫ ঘণ্টার মধ্যে পেমেন্ট সম্পন্ন করা হবে, ইনশাআল্লাহ।"
    });
  } catch (error) {
    const message = error.message === "Unexpected end of JSON input" ? "সঠিক তথ্য পাঠান।" :
      (error.message || "অনুরোধটি সম্পন্ন করা যায়নি।");
    return json(res, 400, { error: message });
  }
});
server.listen(PORT, "127.0.0.1", () => {
  console.log("EarnStationBD withdrawal API listening on http://127.0.0.1:" + PORT);
});
