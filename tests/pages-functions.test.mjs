import test from "node:test";
import { webcrypto } from "node:crypto";
import { encryptPayoutAccount, decryptPayoutAccount } from "../functions/_shared/payout-crypto.js";

globalThis.crypto ??= webcrypto;
import assert from "node:assert/strict";
import { onRequest as memberWithdrawal } from "../functions/api/withdrawal.js";
import { onRequest as adminWithdrawals } from "../functions/api/admin/withdrawals.js";

const request = (url, method = "POST", headers = {}, body = "{}") =>
  new Request(url, { method, headers: { "Content-Type": "application/json", ...headers }, body: method === "GET" || method === "OPTIONS" ? undefined : body });

test("member withdrawal route rejects requests without a session", async () => {
  const res = await memberWithdrawal({ request: request("https://example.test/api/withdrawal"), env: {} });
  assert.equal(res.status, 401);
});

test("admin withdrawal route rejects requests without a session", async () => {
  const res = await adminWithdrawals({ request: request("https://example.test/api/admin/withdrawals", "GET"), env: {} });
  assert.equal(res.status, 401);
});

test("member withdrawal route rejects untrusted origins", async () => {
  const req = request("https://example.test/api/withdrawal", "POST", { Origin: "https://evil.example", Authorization: "Bearer test" });
  const res = await memberWithdrawal({ request: req, env: {} });
  assert.equal(res.status, 403);
});

test("member withdrawal route fails closed when server bindings are missing", async () => {
  const req = request("https://example.test/api/withdrawal", "POST", { Authorization: "Bearer test" });
  const res = await memberWithdrawal({ request: req, env: {} });
  assert.equal(res.status, 503);
});

test("admin withdrawal route fails closed when server bindings are missing", async () => {
  const req = request("https://example.test/api/admin/withdrawals", "GET", { Authorization: "Bearer test" });
  const res = await adminWithdrawals({ request: req, env: {} });
  assert.equal(res.status, 503);
});

test("both Pages routes answer preflight without accessing Supabase", async () => {
  const member = await memberWithdrawal({ request: request("https://example.test/api/withdrawal", "OPTIONS"), env: {} });
  const admin = await adminWithdrawals({ request: request("https://example.test/api/admin/withdrawals", "OPTIONS"), env: {} });
  assert.equal(member.status, 204);
  assert.equal(admin.status, 204);
});


test("payout account encryption round-trips without exposing plaintext", async () => {
  const key = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const encrypted = await encryptPayoutAccount("01712345678", key);
  assert.match(encrypted, /^v1\./);
  assert.equal(encrypted.includes("01712345678"), false);
  assert.equal(await decryptPayoutAccount(encrypted, key), "01712345678");
});

test("payout account encryption rejects a tampered ciphertext", async () => {
  const key = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const encrypted = await encryptPayoutAccount("01712345678", key);
  const [version, payload] = encrypted.split(".");
  const bytes = Buffer.from(payload, "base64");
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(() => decryptPayoutAccount(version + "." + bytes.toString("base64"), key));
});

test("member withdrawal route accepts its own HTTPS custom domain origin", async () => {
  const req = request("https://earnstationbd.example/api/withdrawal", "POST", {
    Origin: "https://earnstationbd.example",
    Authorization: "Bearer test"
  });
  const res = await memberWithdrawal({ request: req, env: {} });
  assert.equal(res.status, 503);
});

test("admin withdrawal route accepts its own HTTPS custom domain origin", async () => {
  const req = request("https://earnstationbd.example/api/admin/withdrawals", "GET", {
    Origin: "https://earnstationbd.example",
    Authorization: "Bearer test"
  });
  const res = await adminWithdrawals({ request: req, env: {} });
  assert.equal(res.status, 503);
});


test("member withdrawal validates session, encrypts payout details and calls the guarded RPC", async () => {
  const key = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const originalFetch = globalThis.fetch;
  let rpcBody;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "member-1" });
    if (String(url).endsWith("/rest/v1/rpc/request_withdrawal")) {
      rpcBody = JSON.parse(init.body);
      return new Response(JSON.stringify("00000000-0000-4000-8000-000000000001"), { status: 200 });
    }
    throw new Error("Unexpected URL " + url);
  };
  try {
    const req = request("https://earnstationbd.example/api/withdrawal", "POST", {
      Origin: "https://earnstationbd.example",
      Authorization: "Bearer member-session"
    }, JSON.stringify({ method: "bkash", account: "01712345678", amount: 150 }));
    const res = await memberWithdrawal({
      request: req,
      env: { SUPABASE_URL: "https://test.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key", PAYOUT_ENCRYPTION_KEY: key }
    });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.request_id, "00000000-0000-4000-8000-000000000001");
    assert.equal(rpcBody.p_amount, 150);
    assert.equal(rpcBody.p_method, "bkash");
    assert.equal(await decryptPayoutAccount(rpcBody.p_account_ciphertext, key), "01712345678");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin withdrawal route denies a signed-in non-admin", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "member-1" });
    if (String(url).includes("/rest/v1/profiles?")) return Response.json([{ role: "member", account_status: "active" }]);
    throw new Error("Unexpected URL " + url);
  };
  try {
    const req = request("https://earnstationbd.example/api/admin/withdrawals", "GET", {
      Origin: "https://earnstationbd.example",
      Authorization: "Bearer member-session"
    });
    const res = await adminWithdrawals({
      request: req,
      env: { SUPABASE_URL: "https://test.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key", PAYOUT_ENCRYPTION_KEY: "A".repeat(44) }
    });
    assert.equal(res.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin withdrawal list returns decrypted payout details only after admin verification", async () => {
  const key = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const encrypted = await encryptPayoutAccount("01712345678", key);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/auth/v1/user")) return Response.json({ id: "admin-1" });
    if (value.includes("/rest/v1/profiles?") && value.includes("select=role")) {
      return Response.json([{ role: "admin", account_status: "active" }]);
    }
    if (value.includes("/rest/v1/withdrawal_requests?")) {
      return Response.json([{
        id: "00000000-0000-4000-8000-000000000002",
        user_id: "member-1",
        amount: 150,
        payout_method: "bkash",
        payout_account_ciphertext: encrypted,
        status: "pending",
        is_test: false,
        created_at: "2026-11-26T10:00:00Z"
      }]);
    }
    if (value.includes("/rest/v1/profiles?")) {
      return Response.json([{ id: "member-1", full_name: "Test Member", phone: "01700000000" }]);
    }
    throw new Error("Unexpected URL " + url);
  };
  try {
    const req = request("https://earnstationbd.example/api/admin/withdrawals", "GET", {
      Origin: "https://earnstationbd.example",
      Authorization: "Bearer admin-session"
    });
    const res = await adminWithdrawals({
      request: req,
      env: { SUPABASE_URL: "https://test.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key", PAYOUT_ENCRYPTION_KEY: key }
    });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.withdrawals.length, 1);
    assert.equal(result.withdrawals[0].payout_account, "01712345678");
    assert.equal(result.withdrawals[0].member.full_name, "Test Member");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("member withdrawal rejects oversized bodies even without Content-Length", async () => {
  const req = request("https://earnstationbd.example/api/withdrawal", "POST", {
    Origin: "https://earnstationbd.example",
    Authorization: "Bearer member-session"
  }, "x".repeat(5000));
  const res = await memberWithdrawal({
    request: req,
    env: { SUPABASE_URL: "https://test.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key", PAYOUT_ENCRYPTION_KEY: "A".repeat(44) }
  });
  assert.equal(res.status, 413);
});

test("admin withdrawal rejects oversized review bodies", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "admin-1" });
    if (String(url).includes("/rest/v1/profiles?") && String(url).includes("select=role")) {
      return Response.json([{ role: "admin", account_status: "active" }]);
    }
    throw new Error("Unexpected URL " + url);
  };
  try {
    const req = request("https://earnstationbd.example/api/admin/withdrawals", "POST", {
      Origin: "https://earnstationbd.example",
      Authorization: "Bearer admin-session"
    }, "x".repeat(3000));
    const res = await adminWithdrawals({
      request: req,
      env: { SUPABASE_URL: "https://test.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key", PAYOUT_ENCRYPTION_KEY: "A".repeat(44) }
    });
    assert.equal(res.status, 413);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
