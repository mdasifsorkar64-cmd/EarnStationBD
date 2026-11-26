import test from "node:test";
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
