---
source: src/modules/account/services/two-factor-enrollment.ts
sha256: 3e0c91c04e43e2ed12cd72b66f780188c66c7472ddede96321bddeb9bdf593a3
generated_at: 2026-10-29T02:46:08.773544+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-enrollment.ts

## Purpose

Orchestrates the user-facing two-factor enrollment lifecycle: querying status, starting (or restarting) a method's setup, delivering verification codes, confirming and arming a method, and minting backup codes. It owns the "which entry to load and when the account flag flips" logic; per-method rules (TOTP, SMS, etc.) live in `../two-factor/registry`.

## Key elements

- **`twoFactorStatus`** (`GET /account/2fa`) — Returns the account's armed methods, the set of still-available methods with eligibility info, and the remaining backup-code count.
- **`setupTwoFactorMethod`** (`POST …/setup`) — Starts or restarts one method's enrollment. Requires a verified factor code (or backup code) when any factor is already armed; the very first factor needs only the route-guard's fresh password.
- **`beginSetup`** *(internal)* — Enforces the delivery cooldown, disarms the existing entry, then delegates to `handler.setup`. Disarms **before** the handler runs so a failed restart can't leave the old secret armed.
- **`sendMethodCode`** (`POST …/send`) — Delivers a one-time code for an already-armed delivered method so the user can prove themselves without spending a backup code.
- **`confirmTwoFactorMethod`** (`POST …/confirm`) — Verifies the pending code against the handler, then arms the entry. Mints backup codes when the account currently has zero (not strictly "first factor"), marks all prior sessions ended, and persists.
- **`armMethod`** *(internal)* — Sets `enrolledAt`, generates/salts backup codes if needed, calls `userService.markSessionsEnded`, and persists.
- **`announceAuthenticatorLoss`** *(internal)* — When the last armed TOTP entry is removed from an account that holds a staff role, publishes an `ACCOUNT_AUTHENTICATOR_REMOVED` outbox event so downstream consumers (e.g. API-key revocation) can react.
- **`entryFor`** *(internal)* — Finds or creates a `TwoFactorMethodRecord` on the user document; reads the entry back after push so the handler mutates the hydrated Mongoose subdocument.
- **`isArmedAuthenticator`** *(internal)* — Checks whether an entry is an armed TOTP method (the factor a staff role is gated on).

## Relationships

- **`@modules/account/services/caller.ts`** — Uses `withOwnAccount` to load the caller's `UserDocument` and enforce self-access on every export.
- **`@modules/account/services/revocation.ts`** — Imports `revokeFor` (used in the removal path, beyond the truncated section).
- **`@modules/account/audit.ts`** — Imports `accountAuditActions` to tag audit entries on code-sent and enrollment events.
- **`@modules/account/events.ts`** — Imports the `ACCOUNT_AUTHENTICATOR_REMOVED` event name for the outbox announcement.
- **`@modules/access` (index / services)** — Calls `accessService.rolesOf` to check whether the account holds a staff role before publishing the authenticator-loss event.
- **`@kernel/access/tenant.ts`** — Imports `DEPLOYMENT_TENANT_ID` as the tenant scope for the role check.
- **`@kernel/outbox.ts`** — Uses `announceInTransaction` to write the `ACCOUNT_AUTHENTICATOR_REMOVED` outbox row atomically.
- **`@infrastructure/http/response.ts`** — All public functions return `ResponseSuccess` / `ResponseReject` built via `generateSuccess` / `generateReject`.
- **`@infrastructure/http/errors.ts`** — Every export's `.catch` wraps unexpected errors in `rejectDatabaseEnvelope('auth', …)`.
- **`@infrastructure/i18n`** — Uses `t()` for user-facing error strings (unknown method, code-required, setup-not-started, etc.).

## Notes

- **Mongoose subdocument hydration:** `entryFor` deliberately reads the entry back from the array after `.push` rather than reusing the plain object literal, because Mongoose replaces it with a hydrated subdocument and downstream mutation depends on that.
- **Backup-code minting is count-based, not ordinal:** codes are regenerated when `twoFactorBackupCodes.length === 0`, which correctly handles re-enrollment after codes are exhausted, not just "first factor ever."
- **Disarm-before-setup invariant:** `beginSetup` clears `enrolledAt` and the delivered code *before* calling `handler.setup`, ensuring a mid-setup failure cannot leave two live secrets for the same method.
- **Session invalidation rides the factor's own write:** `userService.markSessionsEnded` is called inside the same save path as arming, so a second write failing cannot leave old sessions live.
- **The file is truncated** in the source provided; removal endpoints (`removeTwoFactorMethod`, `removeAllTwoFactorMethods`) and the tail of `armMethod` are not visible.
