---
source: src/modules/account/services/two-factor.ts
sha256: 93ed832540cf1be9652e1c0f8e830002499d5c1d23c0fcb2dc5aeb6629e21a3e
generated_at: 2026-09-23T18:10:25.624313+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor.ts

## Purpose
Cross-cutting two-factor authentication logic: enrollment, removal, status, and login-challenge verification. Method-specific behavior is delegated to handlers registered in `../two-factor/registry`; this file owns what is shared across all methods — entry ordering, the account-level armed flag, backup-code minting/discarding, and the login-challenge lifecycle (build → verify → spend).

## Key elements
- **`buildLoginChallenge(user, amr)`** — generates a 128-bit single-use challenge token (same mechanism as password-reset), persists it via `userService.tokenAdd`, and returns the `MfaChallenge` body for `POST /account/login`. TTL is method-dependent (see below).
- **`twoFactorStatus(userId)`** — `GET /account/2fa`. Returns enrolled methods (with `enrolledAt`), available-but-not-enrolled methods (with eligibility), and remaining backup-code count.
- **`setupTwoFactorMethod`** *(truncated in source)* — starts or restarts one method's enrollment; restarting disarms an already-confirmed method.
- **`MFA_CHALLENGE_DELIVERED_TTL_MS`** (600 000 ms) — exported; consumed by `../rate-limits.ts` to align challenge-budget windows with challenge lifetime.
- **`verifyAnyFactor` / `verifyInOrder`** — walks armed factors in registry order (recursive, strictly sequential), then falls back to `consumeBackupCode`.
- **`syncArmedState` / `discardIfDisarmed`** — re-derive `twoFactorEnabledAt`; the latter also clears backup codes when the last factor is removed.
- **`audited`** — wraps any method outcome (success *or* failure) with a `recordAudit` call before passing the response through.
- **`rejectWrongCode`** — persists the attempt-budget mutation before returning 422, so a lost write cannot silently remove the attempt ceiling.
- **`RESEND_TOO_SOON_CODE`** — module-private string the client branches on to render a resend countdown.

## Relationships
- **`./tokens.ts`** — calls `findLiveTokenEntry`, `findLiveToken`, `spendLiveToken` to load and consume the MFA challenge token on verification.
- **`../two-factor/backup-codes.ts`** — imports `generateBackupCodes`, `hashBackupCode` for minting and matching backup codes.
- **`../two-factor/delivered-codes.ts`** — imports `clearDeliveredCode`, `deliveryCooldownRemaining` for the delivered-code resend path.
- **`../cooldown.ts`** — imports `resendTooSoon` to gate resends.
- **`../audit.ts`** — imports `accountAuditActions` for the action identifiers passed to `recordAudit`.
- **`../rate-limits.ts`** — imports `MFA_CHALLENGE_DELIVERED_TTL_MS` to size its MFA-challenge rate-limit windows.
- **`@infrastructure/http/response.ts`** — all public responses are built with `generateSuccess` / `generateReject`.
- **`@infrastructure/http/errors.ts`** — database failures are normalised through `rejectDatabaseEnvelope`.
- **`@infrastructure/i18n`** — user-facing error strings via `t()`.
- **`@infrastructure/observability/audit.ts`** — `recordAudit` for every method-scoped action.
- **`services/index.ts`** — barrel re-export for route handlers.
- **`tests/unit/two-factor.test.ts`** — unit tests for this module.

## Notes
- **Backup codes are always tried *after* every armed factor.** A stolen backup list must never shadow a working authenticator.
- **`syncArmedState` does not touch backup codes.** Discarding them is intentional only in `discardIfDisarmed` (deliberate 2FA removal). An abandoned re-enrollment must not invalidate a list the user already wrote down.
- **`verifyInOrder` is recursive, not a loop.** Each handler mutates its own entry (high-water mark, burned code); a losing branch must not spend anything, so the chain must remain strictly sequential.
- **`entryFor` reads back from the array after `push`.** Mongoose hydrates a pushed subdocument; the handler that mutates it needs the hydrated instance, not the plain object.
- **`summarize` omits `enrolledAt`.** The login step is answered by someone who has proved only a password; which factor was armed is not in scope for that audience. `twoFactorStatus` adds it for the authenticated owner.
- **The login half stops short of minting a session.** `../controllers/post-login-2fa.ts` is the single caller that converts a verified challenge into cookies.
- **`MFA_CHALLENGE_TTL_MS` (300 s) is private.** Delivered-factor challenges get double (600 s) to cover SMTP queue, spam filter, and app-switching.
- **Challenges are hashed-at-rest, single-use tokens** (same `tokens[]` mechanism as password-reset), not JWTs. `spendLiveToken` makes a second presentation a hard refusal, not a re-check.
