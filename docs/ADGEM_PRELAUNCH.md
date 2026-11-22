# EarnStationBD — AdGem prelaunch integration notes

## What this branch adds
- Admin-controlled member reward percentage (default 60%); owner share is the exact remainder (default 40%).
- On admin approval of a manually reconciled **BDT gross commission**, member ledger receives only the configured member percentage. The rest is recorded in `partner_commission_allocations` as owner share.
- Signed AdGem v3 callback receiver that stores a minimal, verified event in `partner_postback_events`.
- The callback receiver does **not** automatically create a BDT conversion, credit a member, or mark AdGem payout as received. AdGem `payout` is USD; a verified exchange/settlement reconciliation step is still required.

## SQL
After the previously applied commission verification migration, review and run:
`supabase/commission_split_prelaunch.sql`
in Supabase SQL Editor. It is idempotent for the new columns/tables/functions.

## Admin commission setting
Admin panel > আয় ও সীমা নিয়ন্ত্রণ > কমিশন ভাগ. The UI setting is protected by admin-only RPC. Do not enable ads from this setting; ads remain disabled until a provider-approved integration is live.

## AdGem v3 receiver deployment (not live until hosted)
Use a server with Node.js 18+ and public HTTPS. This file is a separate service; do not expose the existing local withdrawal server or service-role key.
Set server environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; NEVER browser or Git)
- `ADGEM_POSTBACK_KEY` (the one-time AdGem v3 Postback Key)
- `ADGEM_APP_ID` (approved AdGem Property/App ID)
- optional `ADGEM_POSTBACK_PORT` (default 3010)

Run `node adgem-postback-v3.js` behind an HTTPS reverse proxy and configure the AdGem dashboard URL as:
`https://YOUR_APPROVED_DOMAIN/api/postbacks/adgem/v3`

The receiver checks the raw-body HMAC SHA-256 `Signature` header, app ID, 10-minute timestamp window, reward event, UUID player ID, and positive USD payout. It deduplicates by AdGem conversion ID and returns 2xx only after the database accepts/ignores a duplicate. Request AdGem's production static IP and apply network-level allowlisting at the hosting proxy/firewall when available.

## Important launch gate
1. AdGem approves the website/property and the incentive-to-cash/bKash reward model in writing.
2. HTTPS deployment and a signed test callback are verified.
3. Configure the actual USD settlement-to-BDT reconciliation/rate, with documented evidence; never guess a rate.
4. Reconcile callback to actual payable/received amount and then create a BDT partner conversion for admin review.
5. Only then can member reward be credited. No fake/test callback or income should be entered as real.
