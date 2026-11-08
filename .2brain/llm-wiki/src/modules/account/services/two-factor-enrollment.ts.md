---
source: src/modules/account/services/two-factor-enrollment.ts
sha256: 3e0c91c04e43e2ed12cd72b66f780188c66c7472ddede96321bddeb9bdf593a3
generated_at: 2026-11-08T04:24:23.541982+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-enrollment.ts

## Purpose
Service layer for the account's two-factor authentication lifecycle: querying armed/available methods, starting (or restarting) enrollment for a method, delivering a code for an armed delivered method, confirming (arming) a pending method, and minting backup codes. Method-specific rules (TOTP, SMS, etc.) are delegated to the registry in `../two-factor`; this file owns the *account-level* state transitions and the "which entry, when" decisions.

## Key elements

- **`twoFactorStatus(userId)`** — `GET /account/2fa`. Returns the list of armed methods, the methods still available for enrollment (with per-user eligibility), and the remaining backup-code count.
- **`setupTwoFactorMethod(userId, method, code?, context)`** — `POST …/setup`. Starts or restarts enrollment for one method. First factor requires only fresh-auth; subsequent factors require a verified code or backup code before proceeding.
- **`sendMethodCode(userId, method, context)`** — `POST …/send`. Delivers a code for an already-armed delivered method so the holder can self-prove without spending a backup code. Audited via `accountAuditActions.AUTH_2FA_CODE_SENT`.
- **`confirmTwoFactorMethod(userId, method, code, context)`** — `POST …/confirm`. Verifies the pending code and arms the entry. Mints backup codes if the account currently has none (not merely "first factor"). Audited via `AUTH_2FA_ENROLLED`.
- **`entryFor(user, method)`** — Internal. Looks up or creates the method's entry on the user document; reads back from the array after push (Mongoose subdocument hydration).
- **`beginSetup(user, handler, context)`** — Internal. Clears the prior armed state, honours delivery cooldown, delegates to `handler.setup`, persists.
- **`armMethod(user, entry)`** — Internal. Sets `enrolledAt`, mints backup codes + salt if needed, marks sessions ended, persists.
- **`announceAuthenticatorLoss(user, hadAuthenticator)`** — Internal. When the *last* armed TOTP authenticator of a staff-role account is removed, publishes `ACCOUNT_AUTHENTICATOR_REMOVED` via the outbox so downstream subscribers (e.g. API-key revocation) react.
- **`isArmedAuthenticator(entry)`** — Internal. Narrow predicate: method is `totp` and `enrolledAt` is set.

## Relationships

- **`@infrastructure/http/response`** / **`@infrastructure/http/errors`** — All public functions return `ResponseSuccess`/`ResponseReject` via `generateSuccess`/`generateReject`; DB-level failures are wrapped with `rejectDatabaseEnvelope('auth', …)`.
- **`@infrastructure/i18n`** — User-facing error strings go through `t()`.
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` scopes the `accessService.rolesOf` call inside `announceAuthenticatorLoss`.
- **`@kernel/outbox`** — `announceInTransaction` writes the outbox row for the authenticator-removed event.
- **`@modules/access`** — `accessService.rolesOf` checks whether the account holds a tenant or platform staff role before publishing the loss event.
- **`../audit`** — `accountAuditActions` supplies the action codes for the `audited()` wrapper.
- **`../events`** — `ACCOUNT_AUTHENTICATOR_REMOVED` constant used as the outbox event name.
- **`./caller`** — `withOwnAccount` guarantees the caller operates on their own user document and enforces session scoping.
- **`./revocation`** — `revokeFor` is imported (used in the truncated removal path to revoke sessions/tokens when a factor is dropped).
- **`./two-factor-outcomes`** / **`./two-factor-lockout`** — Shared helpers for cooldown checks, delivery, verdict settling, and audit wrapping that are reused across enrollment and removal.
- **`../two-factor`** — Method registry (`twoFactorMethod`, `availableTwoFactorMethods`), backup-code utilities, and per-method handler contracts.
- **`services/index.ts`** — Re-exports the public functions of this module for route-layer consumption.

## Notes

- **Mongoose subdocument gotcha:** `entryFor` deliberately reads the entry back from `user.twoFactorMethods` after a push. Reusing the plain object literal would bypass Mongoose's subdocument hydration and lose middleware/setter behaviour on subsequent mutations.
- **Restart disarms first:** `beginSetup` nulls `enrolledAt` *before* calling `handler.setup`, so a failed restart cannot leave both an old armed secret and a new pending one simultaneously.
- **Backup-code minting is account-scoped, not method-scoped:** codes are generated only when `twoFactorBackupCodes.length === 0`, regardless of whether this is the "first factor" or a re-enrollment.
- **Cooldown interaction:** a delivered code that was just verified to prove the caller is spent; `beginSetup` checks the cooldown *after* that verification, so the caller's own proof does not block the restart.
- **`announceAuthenticatorLoss` is narrowly gated:** it fires only when (a) the account held an armed TOTP before, (b) *all* armed TOTP entries are now gone, and (c) the account still holds a staff role. Any other removal is silent here.
- The file is truncated in the source; a removal endpoint (`DELETE …/method` or bulk) and its use of `revokeFor` / `hashBackupCodes` / `settleVerdict` / `withVerifiedCode` are expected below the cutoff.
