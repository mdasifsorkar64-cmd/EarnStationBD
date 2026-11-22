"use strict";
// EarnStationBD AdGem Postback v3 receiver.
// Deploy ONLY on a public HTTPS server. Keep all secrets in server environment.
// This endpoint verifies and stores a callback event; it intentionally does NOT
// credit a member or convert AdGem USD payout to BDT automatically.
const http = require("node:http");
const crypto = require("node:crypto");

const PORT = Number(process.env.ADGEM_POSTBACK_PORT || 3010);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADGEM_POSTBACK_KEY = process.env.ADGEM_POSTBACK_KEY;
const ADGEM_APP_ID = process.env.ADGEM_APP_ID;
const MAX_BODY = 32 * 1024;
const MAX_AGE_SECONDS = 10 * 60;

function respond(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(message || "");
}
function validSignature(raw, received) {
  if (!ADGEM_POSTBACK_KEY || !received || !/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac("sha256", ADGEM_POSTBACK_KEY).update(raw).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/postbacks/adgem/v3") {
    return respond(res, 404, "Not found");
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADGEM_POSTBACK_KEY || !ADGEM_APP_ID) {
    return respond(res, 503, "Server configuration incomplete");
  }
  try {
    const raw = await readRaw(req);
    const signature = req.headers.signature || "";
    if (!validSignature(raw, signature)) return respond(res, 401, "Invalid signature");
    let body;
    try { body = JSON.parse(raw.toString("utf8")); }
    catch (_) { return respond(res, 400, "Invalid JSON"); }

    const sentAt = Number(body.timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!body.request_id || typeof body.request_id !== "string" ||
        body.request_id.length > 150 || !Number.isFinite(sentAt) ||
        Math.abs(now - sentAt) > MAX_AGE_SECONDS) {
      return respond(res, 400, "Invalid request id or stale timestamp");
    }
    const d = body.data || {};
    if (String(d.app_id) !== ADGEM_APP_ID) return respond(res, 403, "Wrong app id");
    if (d.conversion_type !== "reward") return respond(res, 200, "Ignored non-reward event");
    const playerId = String(d.player_id || "").toLowerCase();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    if (!uuidPattern.test(playerId)) return respond(res, 422, "Invalid player id");
    const conversionId = String(d.conversion_id || "").trim();
    const payout = Number(d.payout);
    const virtualAmount = Number(d.amount || 0);
    if (!conversionId || conversionId.length > 200 ||
        !Number.isFinite(payout) || payout <= 0 ||
        !Number.isFinite(virtualAmount) || virtualAmount < 0) {
      return respond(res, 422, "Invalid conversion or payout");
    }

    // Store only fields needed for reconciliation; do not retain device IDs/IP/raw payload.
    const record = {
      partner_name: "AdGem",
      request_id: body.request_id,
      external_conversion_id: conversionId,
      player_id: playerId,
      app_id: String(d.app_id),
      campaign_id: d.campaign_id == null ? null : String(d.campaign_id),
      offer_id: d.offer_id == null ? null : String(d.offer_id),
      conversion_type: "reward",
      virtual_amount: virtualAmount,
      payout_usd: payout,
      event_timestamp: new Date(sentAt * 1000).toISOString(),
      event_status: "verified_pending_reconciliation"
    };
    const url = SUPABASE_URL.replace(/\/$/, "") +
      "/rest/v1/partner_postback_events?on_conflict=partner_name,external_conversion_id";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal"
      },
      body: JSON.stringify(record)
    });
    if (!response.ok) {
      // 5xx causes AdGem to retry; don't acknowledge a failed database write.
      return respond(res, 503, "Event storage failed");
    }
    return respond(res, 200, "OK");
  } catch (error) {
    if (error.message === "Payload too large") return respond(res, 413, "Payload too large");
    return respond(res, 503, "Temporary processing error");
  }
});
server.listen(PORT, "0.0.0.0", () => {
  console.log("EarnStationBD AdGem v3 postback receiver listening on port " + PORT);
});
