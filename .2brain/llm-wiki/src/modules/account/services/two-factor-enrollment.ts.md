---
source: src/modules/account/services/two-factor-enrollment.ts
source_sha256: 6fd53479bf651246275a1d13ef55b980ab0ee675b048cdf0016cada100839745
context_sha256: 40880f005f8b74f95c75518545bbf782f3857341f85ce36551669179bd508fab
generated_at: 2026-11-22T03:43:19.288209+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/two-factor-enrollment.ts

## Purpose
Account-level service for managing second factors: reporting status, starting (or restarting) enrollment of a method, delivering codes for armed methods, confirming/arming a method, and minting backup codes. It decides which method entry to load and when the account's 2FA flag flips; the per-method rules live in `../two-factor` (registry). The module doc also lists removing one or all methods, though that part is beyond what is shown here.

## Key elements
- `entryFor(user, method)` — finds the user's entry for a method, or pushes an empty one and reads it back (so the handler gets the Mongoose subdocument, not the plain literal).
- `isArmedAuthenticator(entry)` — true for a `totp` entry with `enrolledAt` set; the factor a staff role is gated on.
- `announceAuthenticatorLoss(user, hadAuthenticator)` — when the last armed authenticator app of an account holding a tenant or platform role (looked up via the access service against `DEPLOYMENT_TENANT_ID`) is gone, writes an `ACCOUNT_AUTHENTICATOR_REMOVED` outbox event through `announceInTransaction`, so `api-keys` can revoke keys that user minted. Otherwise it does nothing.
- `twoFactorStatus(userId)` — `GET /account/2fa`. Returns `enabled`, armed `methods` (with `enrolledAt`), `available` methods not yet armed (with eligibility), and `backupCodesRemaining`.
- `setupTwoFactorMethod(userId, method, code, context)` — `POST /account/2fa/methods/{method}/setup`. Returns 404 for an unknown method and 422 if not enrollable. With no armed factor it begins setup directly. Otherwise it requires a `code` (422 if missing), verifies it through `verifyArmedFactor`, and settles the verdict via `settleVerdict` before starting.
- `beginSetup(user, handler, context)` — honours the delivery cooldown (`tooSoon`), disarms the entry (`enrolledAt = undefined`, clears any delivered code), calls `handler.setup`, then persists via `accountUserService.persistTwoFactorMethods`.
- `sendMethodCode(userId, method, context)` — `POST .../send`. Delivers a code for an armed delivered method through `deliverArmedCode`, wrapped in `audited` with `AUTH_2FA_CODE_SENT`.
- `confirmTwoFactorMethod(userId, method, code, context)` — `POST .../confirm`. Requires a pending, not-yet-armed entry (422 `setup-not-started` otherwise), verifies the code with `handler.verify`, and on a match calls `armMethod` and `notifyChange(..., 'enrolled', ...)`. A wrong code goes to `rejectWrongCode`. Audited as `AUTH_2FA_ENROLLED`.
- `armMethod(user, entry)` — marks the verified entry armed and builds the response. It generates backup codes only when the account has none left; the rest of this function is not shown.

## Relationships
- `./caller` — `withOwnAccount` loads the caller's own account for every handler here.
- `./two-factor-lockout` — `verifyArmedFactor`, `settleVerdict` and `withVerifiedCode` (the last is imported, but its use is not visible here) gate changes once a factor is armed.
- `./two-factor-outcomes` — helpers for armed entries, auditing, code delivery, change notifications, cooldown and wrong-code rejections, and method summaries.
- `./revocation` — `revokeFor` is imported, but its use is not visible in the shown portion.
- `../audit` and `../events` — supply `accountAuditActions` and `ACCOUNT_AUTHENTICATOR_REMOVED`.
- `@kernel/outbox` and `@kernel/access/tenant` — `announceInTransaction` and `DEPLOYMENT_TENANT_ID`.
- `@modules/access` — the access service is used to look up an account's tenant and platform roles to detect staff roles.
- `@infrastructure/http/response` and `@infrastructure/http/errors` — `generateSuccess`/`generateReject` build responses; `rejectDatabaseEnvelope('auth', error)` turns thrown errors into rejects.
- `@infrastructure/i18n` — `t(...)` supplies the localized error messages.
- `@modules/users` and its `friends/account` — `accountUserService` persists the method entries and clears delivered codes.

## Notes
- Restarting setup disarms an already-confirmed method before the handler runs. Hence the route requires fresh critical auth, and a failed restart cannot leave the old secret armed beside a new pending one.
- Once any factor is armed, changing factors requires a valid factor or backup code, so a stolen but fresh session cannot swap them.
- The "armed" account flag is derived by `persistTwoFactorMethods` from the stored entries. A disarmed factor mid-re-enrollment leaves existing backup codes alone.
- Backup codes are returned in clear text only once. They are minted when the account has none left, not strictly on the first factor.
- `twoFactorStatus` lists only armed entries, so pending enrollments never appear as active factors.
