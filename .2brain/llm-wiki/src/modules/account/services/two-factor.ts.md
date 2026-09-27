---
source: src/modules/account/services/two-factor.ts
sha256: 19604616a29ea9f79302e798a801662bc69ae414c2ac0911a519da2a8523c86f
generated_at: 2026-09-27T14:31:28.177964+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor.ts

## Purpose

Implements the account-level 2FA lifecycle: enrolling a method, removing it, regenerating backup codes, and verifying a code (from any armed method or the backup list) against a live account. Method-specific logic lives in handlers registered under `../two-factor/registry`; this file owns the cross-cutting concerns—entry loading order, verification sequence, the `twoFactorEnabledAt` flag, and when backup codes are minted or discarded. It also builds the login challenge (`buildLoginChallenge`) and verifies it, stopping short of minting a session (that belongs to `../controllers/post-login-2fa.ts`).

## Key elements

- **`audited`** (private) — wraps any 2FA action's promise, records an audit entry (action, success/failure, method), and passes the result through unchanged.
- **`rejectWrongCode`** (private) — persists the user doc *before* returning a 422, so the attempt-budget write is not lost.
- **`armedEntries` / `entryFor`** (private) — select enrolled entries in registry order; `entryFor` gets-or-creates a method record and reads it back from the array (Mongoose subdocument hydration).
- **`consumeBackupCode`** (private) — scrypt-hashes the candidate under the account salt, then `constantTimeEqual`-compares against **every** stored digest before splicing the match (timing-safe).
- **`verifyInOrder` / `verifyAnyFactor`** (private) — recursively walk armed factors sequentially; only after all decline does it try backup codes.
- **`withVerifiedCode`** (private) — shared guard-and-act shape for the three owner-gated actions (remove method, disable 2FA, regenerate backup codes).
- **`syncArmedState` / `discardIfDisarmed`** (private) — re-derive `twoFactorEnabledAt`; `discardIfDisarmed` additionally clears backup codes only when the last factor is gone.
- **`summarize`** (private) — builds the public `TwoFactorMethodSummary`; deliberately omits `enrolledAt` so a password-only caller cannot enumerate armed factors.
- **`MFA_CHALLENGE_DELIVERED_TTL_MS`** (exported) — 10 min TTL for delivered (email/SMS) challenges; consumed by `../rate-limits.ts` to window its MFA challenge budgets.
- **`buildLoginChallenge`** (exported) — mints a 128-bit single-use challenge token (same `tokens[]` mechanism as password-reset), persists it via `userService.tokenAdd`, and returns the `{ mfaRequired, challenge, … }` body.
- **`sendLoginCode` / `verifyLoginChallenge`** (exported, truncated) — login-half 2FA: deliver a code / verify and spend the challenge token.

## Relationships

- **`../two-factor/backup-codes.ts`** — provides `generateBackupCodes`, `generateBackupCodeSalt`, `hashBackupCode`, `hashBackupCodes`, `DELIVERED_CODE_RESEND_SECONDS`, `availableTwoFactorMethods`, `clearDeliveredCode`, `deliveryCooldownRemaining`, `orderedEntries`, and the `TwoFactorMethodHandler` type.
- **`./tokens.ts`** — `findLiveTokenEntry`, `findLiveToken`, `spendLiveToken` are used to load and single-use-spend the MFA challenge token.
- **`../audit.ts`** — supplies the `accountAuditActions` constants passed to `recordAudit`.
- **`../cooldown.ts`** — `resendTooSoon` is called to enforce the per-method delivery resend window.
- **`../rate-limits.ts`** — imports the exported `MFA_CHALLENGE_DELIVERED_TTL_MS` so its challenge-budget window never outlives the challenge it bounds.
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types shape every return.
- **`@infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` wraps unexpected DB errors into a standard rejection.
- **`@infrastructure/security/constant-time.ts`** — `constantTimeEqual` used in backup-code comparison.
- **`@infrastructure/observability/audit.ts`** — `recordAudit` + `AuditAction` for the `audited` wrapper.
- **`@infrastructure/i18n`** — `t()` for localized user-facing messages (e.g. wrong-code rejection).
- **`./index.ts`** — barrel re-export so other modules import from the service package root.
- **`tests/unit/two-factor.test.ts`** — unit test coverage for this module.

## Notes

- **Verification order is security-critical:** armed factors are always tried before backup codes. Reversing the order would let a stolen backup-code list shadow a still-working authenticator.
- **`rejectWrongCode` persists before rejecting.** Dropping the `persistTwoFactorMethods` write silently removes the attempt ceiling, turning a finite budget into an unbounded one.
- **`syncArmedState` never touches backup codes.** Only `discardIfDisarmed` (last factor removed or 2FA fully disabled) clears them. A mid-reenrollment disarm must not invalidate a list the user has already written down.
- **`summarize` omits `enrolledAt`** so the pre-auth login step cannot be used to fingerprint which factors are active.
- **`entryFor` reads back via `.at(-1)`** after `push` because Mongoose hydrates the new subdocument; reusing the plain object would leave the handler mutating a detached reference.
- **The login challenge is a single-use token** (same `tokens[]` array as password-reset), not a JWT. A second presentation of an already-spent challenge is refused by `spendLiveToken`.
- **`verifyInOrder` is recursive, not a `for` loop**, keeping the chain strictly sequential—each handler may mutate its entry (replay high-water mark, burned code), and a losing branch must not spend anything.
