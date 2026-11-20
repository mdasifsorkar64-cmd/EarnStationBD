"use strict";
// Local withdrawal API. Never commit real secrets or expose them to browser code.
const http = require("node:http");
const crypto = require("node:crypto");

const PORT = Number(process.env.WITHDRAWAL_PORT || 3001);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PAYOUT_ENCRYPTION_KEY = process.env.PAYOUT_ENCRYPTION_KEY;

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "http://127.0.0.1:3000",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  });
  res.end(JSON.stringify(body));
}
function encryptAccount(account) {
  const key = Buffer.from(PAYOUT_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) throw new Error("PAYOUT_ENCRYPTION_KEY must decode to exactly 32 bytes");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(account, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "v1." + Buffer.concat([iv, tag, encrypted]).toString("base64");
}
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST" || req.url !== "/api/withdrawal") return json(res, 404, { error: "Not found" });
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
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 4096) return json(res, 413, { error: "অনুরোধটি অনেক বড়।" });
    }
    const input = JSON.parse(raw || "{}");
    const method = input.method;
    const account = String(input.account || "").replace(/\D/g, "");
    const amount = Number(input.amount);
    if (!["bkash", "nagad"].includes(method)) return json(res, 400, { error: "বিকাশ অথবা নগদ নির্বাচন করুন।" });
    if (!/^01[3-9]\d{8}$/.test(account)) return json(res, 400, { error: "সঠিক ১১ সংখ্যার মোবাইল নম্বর লিখুন।" });
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) return json(res, 400, { error: "সঠিক উত্তোলনের পরিমাণ লিখুন।" });

    const ciphertext = encryptAccount(account);
    const response = await fetch(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/rpc/request_withdrawal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": authorization
      },
      body: JSON.stringify({ p_amount: amount, p_method: method, p_account_ciphertext: ciphertext })
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
    return json(res, 200, { success: true, request_id: result, message: "উত্তোলনের অনুরোধ জমা হয়েছে। প্রশাসকের যাচাইয়ের অপেক্ষায় আছে।" });
  } catch (error) {
    return json(res, 400, { error: error.message === "Unexpected end of JSON input" ? "সঠিক তথ্য পাঠান।" : "অনুরোধটি সম্পন্ন করা যায়নি।" });
  }
});
server.listen(PORT, "127.0.0.1", () => {
  console.log("EarnStationBD withdrawal API listening on http://127.0.0.1:" + PORT);
});
