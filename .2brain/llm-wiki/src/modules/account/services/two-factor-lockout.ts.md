---
source: src/modules/account/services/two-factor-lockout.ts
sha256: 4a1a66b70c1364092ac3d0bd5f790053dc814b13f06718fb83d595652be8e7d9
generated_at: 2026-10-14T08:56:19.368969+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-lockout.ts

## Purpose

Central chokepoint for verifying a two-factor code against an account's armed methods, protected by a per-account wrong-code attempt cap. Every flow that asks the user for a code (reauth, method removal, feature disable, backup-code regeneration) funnels through `verifyArmedFactor` so the lockout logic lives in exactly one place.

## Key elements

- **`armedEntries(user)`** – Returns the account's enrolled factors in the registry's canonical order (not enrollment order).
- **`consumeBackupCode(user, code)`** – Scrypt-hashes the code under the account's salt, constant-time-compares against *every* stored digest (no early exit), then conditionally spends the matched code.
- **`verifyInOrder(user, code, pending)`** – Recursive, strictly sequential walk over armed factors; a losing branch never mutates state.
- **`verifyAnyFactor(user, code)`** – Tries all armed factors first, falls back to backup codes only after every factor declines.
- **`FactorVerdict`** (`'matched' | 'wrong' | 'locked'`) – Discriminates the three possible outcomes.
- **`verifyArmedFactor(user, code, context)`** – Reserves an attempt atomically, verifies, resets the counter on match. The single entry point for the lockout cap.
- **`settleVerdict<T>(verdict, user, onMatch)`** – Maps a `FactorVerdict` to an HTTP response (success, 422, or 429).
- **`proveSecondFactor(user, code, context)`** – Handler for the `otp` half of `POST /account/reauth`; guards on `twoFactorEnabledAt`, persists state on success.
- **`withVerifiedCode<T>(userId, code, context, precondition, onMatch)`** – Generic template for the three self-service 2FA mutations (remove method, disable feature, regenerate backup codes); loads the user, runs a caller-specific precondition, then verifies and applies the mutation.

## Relationships

- **`@modules/users`** (`userService`, `UserDocument`, `TwoFactorMethodRecord`) – Owns the credential fields, the `reserveMfaAttempt` / `resetMfaAttempts` / `spendBackupCode` / `persistTwoFactorMethods` mutations, and `findByIdWithCredentials`.
- **`../two-factor`** (`index.ts`, `registry.ts`, `backup-codes.ts`) – Supplies the registry order (`orderedEntries`), the lockout constants (`MFA_LOCK_MS`, `MFA_MAX_FAILURES`), the backup-code hashing (`hashBackupCode`), and the `TwoFactorMethodHandler` interface.
- **`./two-factor-outcomes`** – Provides the shared rejection builders `rejectWrongCode`, `rejectLocked`, and `notifyLocked`.
- **`@infrastructure/security/constant-time`** – `constantTimeEqual` prevents timing leakage when scanning backup-code digests.
- **`@infrastructure/http/response`** / **`@infrastructure/http/errors`** – Response envelope helpers (`generateSuccess`, `generateReject`, `rejectDatabaseEnvelope`).
- **`@infrastructure/i18n`** – `t()` for localized error/lock messages.

## Notes

- **Ordering is a security invariant, not a style choice.** Backup codes are deliberately tried *after* every armed factor; the file states this twice. A stolen backup list must never shadow a live authenticator.
- **The backup-code loop never short-circuits.** It sets a boolean and checks all digests, so running time reveals nothing about which slot (if any) matched.
- **`verifyInOrder` is recursive, not a `for` loop**, by explicit design: the chain must stay a chain so a losing branch cannot partially spend a handler's mutable state (replay high-water mark, burned code).
- **Enrolment `/confirm` bypasses this file entirely.** It checks a factor that is not yet armed, so a miss there guards nothing; the lockout cap does not apply.
- **`withVerifiedCode` returns a 401 (not 404) when the user is not found**, to avoid leaking account existence.
- The attempt is *reserved* (one atomic write) *before* comparison, so a parallel burst of requests cannot each read "under the cap." A correct code hands the counter back; a wrong code consumes it.
