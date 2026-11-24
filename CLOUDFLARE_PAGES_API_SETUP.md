# Cloudflare Pages API setup (EarnStationBD)

This branch adds Pages Functions for member withdrawals and admin withdrawal review. Browser requests now use same-origin `/api/...` routes; the payout account encryption key stays server-side.

## Required Cloudflare bindings

In **Workers & Pages → earnstationbd → Settings → Variables and Secrets**, add these to **Preview** first (for the PR preview), and later to **Production** when this branch is approved:

- `SUPABASE_URL` — project URL.
- `SUPABASE_ANON_KEY` — the project's public anon/publishable API key (not a service-role key).
- `PAYOUT_ENCRYPTION_KEY` — the exact existing Base64-encoded 32-byte key previously used by the withdrawal server.

**Important:** Do not generate a replacement key if any payout account ciphertext already exists. The old encrypted payout numbers can only be decrypted with the same original key. Mark the encryption key as a Cloudflare Secret; never commit it or put it in browser JavaScript.

The Functions deliberately return a safe configuration error until all three bindings exist.

## Routes

- `GET /api/admin/withdrawals` — checks the caller's Supabase session and admin role.
- `POST /api/admin/withdrawals/complete` — checks admin role and records the verified transaction through the existing database RPC.
- `POST /api/withdrawal` — submits a member request through the existing RPC; account number is encrypted server-side.
- `_routes.json` limits Pages Function invocations to `/api/*`; normal static pages remain static.

No database migration is included. No payment is automatically sent by these endpoints.
