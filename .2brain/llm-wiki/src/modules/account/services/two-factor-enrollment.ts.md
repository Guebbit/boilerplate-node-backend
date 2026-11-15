---
source: src/modules/account/services/two-factor-enrollment.ts
sha256: 7d6a0e4f2af11a4fd85f5598bdd491e7b4e89b26562c1530c5ce75ee4a87dc22
generated_at: 2026-11-14T18:53:37.201577+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-enrollment.ts

## Purpose

Account-level orchestration for the two-factor lifecycle: reporting status, starting (or restarting) a method's enrollment, delivering a code for an armed delivered method, and confirming/arming a pending method. It sits between the HTTP route layer and the per-method handlers (`../two-factor` registry), owning the account flag, backup-code minting, and the outbox announcement that triggers API-key revocation when a staff member's last authenticator is lost.

## Key elements

- **`twoFactorStatus`** — `GET /account/2fa`. Returns armed methods, still-available methods (with eligibility info), and the remaining backup-code count.
- **`setupTwoFactorMethod`** — `POST /…/setup`. Starts or restarts enrollment. First factor needs only the fresh password the route guard demands; any subsequent change requires a verified factor or backup code.
- **`sendMethodCode`** — `POST /…/send`. Delivers a one-time code for an already-armed delivered method (e.g. email/SMS) so the caller can prove identity without spending a backup code.
- **`confirmTwoFactorMethod`** — `POST /…/confirm`. Verifies the caller's code against the pending entry, then arms it. Mints backup codes only if the account has none.
- **`entryFor`** *(internal)* — Finds or creates the user's entry for a method; reads the entry back from the array after pushing (Mongoose subdocument hydration).
- **`beginSetup`** *(internal)* — Honours the delivery cooldown, disarms the old entry, then delegates to the handler's `setup`.
- **`armMethod`** *(internal)* — Stamps `enrolledAt`, generates + hashes backup codes if the list is empty, persists, and notifies.
- **`announceAuthenticatorLoss`** *(internal)* — When the last armed TOTP entry is removed on an account that holds a tenant or platform staff role, publishes an `ACCOUNT_AUTHENTICATOR_REMOVED` outbox event (consumed by `api-keys` revocation).
- **`isArmedAuthenticator`** *(internal)* — Predicate: `method === 'totp'` and `enrolledAt` is set.

## Relationships

- **`src/modules/access/index.ts`** — Imports `accessService`; calls its role-query method with `DEPLOYMENT_TENANT_ID` to decide whether `announceAuthenticatorLoss` should fire (staff-role gate).
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID` used in the staff-role query above.
- **`src/kernel/outbox.ts`** — `announceInTransaction` writes the `ACCOUNT_AUTHENTICATOR_REMOVED` event as a transactional outbox row; the relay retries delivery.
- **`src/modules/account/events.ts`** — `ACCOUNT_AUTHENTICATOR_REMOVED` event-name constant used in the outbox payload.
- **`src/modules/account/services/two-factor/` (registry)** — Supplies `twoFactorMethod`, `availableTwoFactorMethods`, `deliveryCooldownRemaining`, `generateBackupCodes`, `generateBackupCodeSalt`, `hashBackupCodes`, and the `TwoFactorMethodHandler` interface.
- **`src/modules/account/services/two-factor-outcomes`** — Shared outcome helpers: `armedEntries`, `audited`, `deliverArmedCode`, `notifyChange`, `tooSoon`, `rejectWrongCode`, `summarize`.
- **`src/modules/account/services/two-factor-lockout`** — `verifyArmedFactor` / `settleVerdict` / `withVerifiedCode` for the "prove a factor before changing factors" gate.
- **`src/modules/account/services/caller.ts`** — `withOwnAccount` loads the caller's user document with ownership verification before any mutation.
- **`src/modules/users` / `accountUserService`** — `UserDocument`, `TwoFactorMethodRecord` types; `persistTwoFactorMethods` and `clearDeliveredCode` for writes.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` for the API envelope.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` for error wrapping.
- **`src/infrastructure/i18n/index.ts`** — `t()` for localized error messages.
- **`src/modules/account/audit.ts`** — `accountAuditActions` constants used with `audited()` to record 2FA code-sent and enrollment events.
- **`src/modules/account/services/revocation.ts`** — `revokeFor` imported for use in the (truncated) removal path.

## Notes

- **Mongoose subdocument quirk:** `entryFor` pushes a plain object into `user.twoFactorMethods` and then reads it back from the array. Reusing the original literal would bypass Mongoose's hydration into a subdocument, causing silent mutation failures downstream.
- **Disarm-before-setup:** `beginSetup` clears `enrolledAt` and the delivered code *before* calling the handler. A handler that throws leaves the account in a disarmed state rather than leaving the old secret armed alongside a new pending one.
- **Backup-code scope:** Backup codes are account-wide, not per-method. They are generated only when the list is empty, so re-enrolling a second method never invalidates codes the user already wrote down.
- **`announceAuthenticatorLoss` is narrowly scoped:** it fires only when the *last* TOTP entry is gone *and* the account holds a tenant or platform staff role. Removing one of two authenticators, or removing a non-staff account's sole authenticator, emits no event.
- **Cooldown interaction:** `beginSetup` checks `deliveryCooldownRemaining`, but a cooldown left by the very code the caller just verified (a delivered code, now spent) does not block setup because `clearDeliveredCode` is called before the handler runs.
- The file is truncated in the provided content; `revokeFor` (from `./revocation`) and `withVerifiedCode` (from `./two-factor-lockout`) are imported and presumably used in the remaining lines.
