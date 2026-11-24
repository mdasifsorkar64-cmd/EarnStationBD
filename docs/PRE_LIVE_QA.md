# EarnStationBD — Pre-live QA and release checklist

This checklist is for the owner and release reviewer before changes are merged into the production branch `fix/financial-accounting`. The `main` branch is not part of this release.

## Release order and dependencies

- [ ] Review and approve PR #2 (Bengali authentication errors).
- [ ] Review and approve PR #3 (Cloudflare Pages withdrawal API).
- [ ] PR #6 is stacked on PR #3; merge/test PR #3 first, then PR #6.
- [ ] Review PR #4 and PR #5 (Supabase EXECUTE privilege hardening). Their migrations were applied and verified separately; confirm migration history before release.
- [ ] Review PR #7 (owner bKash/Nagad destination settings). Its migration is pending; apply only during the approved release and verify it succeeds.
- [ ] Keep all PRs Draft until owner explicitly approves the release.

## Cloudflare Production bindings

Before merging/deploying the withdrawal API, confirm these exist in the **Production** environment for Pages project `earnstationbd`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (public anon/publishable key only; never service-role)
- `PAYOUT_ENCRYPTION_KEY` (the exact existing key used for stored payout ciphertext)

Do not rotate the encryption key during this release. Never paste it into GitHub, chat, browser JavaScript, or a public log. Preview bindings do not prove Production is configured.

## Preview/manual QA

### Authentication
- [ ] Existing account login succeeds.
- [ ] Wrong password and invalid email show Bengali friendly errors.
- [ ] Signup validates email, 8+ character password, confirmation, name, and Bangladesh mobile.
- [ ] Duplicate phone displays a helpful message; no existing profile is deleted or changed.

### Member withdrawal
- [ ] bKash and Nagad options both display.
- [ ] Invalid phone, missing amount, and amount above available balance are rejected.
- [ ] Requests use the same-origin `/api/withdrawal` endpoint.
- [ ] No payout request is accepted without a valid signed-in session.
- [ ] Verify actual withdrawal fee/net calculation from the displayed DB values; do not create a real payout just for testing.

### Admin withdrawal
- [ ] Unauthenticated `/api/admin/withdrawals` request is rejected.
- [ ] Non-admin account is rejected.
- [ ] Admin sees gross, fee, and net payable amounts.
- [ ] Test withdrawals cannot be marked SUCCESS.
- [ ] SUCCESS is recorded only after the real transfer and verified transaction ID.
- [ ] Auto-refund remains active; never send a payout to a refunded request.

### Owner Wallet and receiving details
- [ ] Summary, partner allocations, and withdrawal history load.
- [ ] Save a valid bKash destination, valid Nagad destination, and both together in Preview/test before production.
- [ ] Invalid number or missing account name is rejected.
- [ ] Only admin can read/write destination details; direct table access is denied.
- [ ] Audit log stores which payment methods were configured, not full account numbers.
- [ ] Confirm the interface explains that partner payment is manual and this setting does not initiate transfers.
- [ ] Owner withdrawal form remains an accounting record after actual money movement.

## Release safety
- [ ] Check latest Cloudflare Preview deployment corresponds to the reviewed PR head.
- [ ] Confirm no secrets or personal payout numbers appear in diffs, logs, or PR comments.
- [ ] No real payment, balance adjustment, or test ledger cleanup is performed as part of QA.
- [ ] Verify live Supabase migration history and privileges after release.
- [ ] Confirm production branch deployment and perform smoke tests.
- [ ] Keep `main` untouched unless separately authorized.

## Rollback notes

If a static/frontend regression occurs, revert the production branch commit and redeploy. For additive SQL changes, prefer a reviewed corrective migration rather than dropping tables/functions automatically. Never delete payout records or rotate the encryption key as a rollback shortcut.
