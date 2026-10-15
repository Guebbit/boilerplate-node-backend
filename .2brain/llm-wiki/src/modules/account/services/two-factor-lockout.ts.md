---
source: src/modules/account/services/two-factor-lockout.ts
sha256: 1e94ae87d3ded878c9914c8271a18c641cc3503d44b0c4cf31f8506d907a57dc
generated_at: 2026-10-15T10:04:24.186073+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-lockout.ts

## Purpose

Central verification gate for every two-factor code check on an armed account. A submitted code is compared against the account's armed factors (in registration order), then against backup codes, all behind a per-account wrong-code lockout counter. The file exists so that no flow can verify a code without first reserving a limited attempt budget, and so the "armed factors before backup codes" invariant is enforced in exactly one place.

## Key elements

- **`FactorVerdict`** (exported type) — `'matched' | 'wrong' | 'locked'`; the tri-state result of one verification attempt.
- **`verifyArmedFactor(user, code, context)`** (exported) — Main entry. Atomically reserves one attempt against `MFA_MAX_FAILURES`; if the slot is unavailable returns `'locked'` without comparing. On success delegates to the internal chain and resets the counter on a match.
- **`settleVerdict(verdict, user, onMatch)`** (exported) — Maps a `FactorVerdict` to an HTTP response: runs `onMatch` for a right code, returns a 429-style reject for locked, or a 422 reject for wrong.
- **`proveSecondFactor(user, code, context)`** (exported) — The `otp` half of `POST /account/reauth`. Guards on `twoFactorEnabledAt`, then calls `verifyArmedFactor` + `settleVerdict`; persists any state mutation (spent backup code, advanced TOTP step) before returning success.
- **`withVerifiedCode<T>(userId, code, context, precondition, onMatch)`** (exported) — Generic helper for caller-specific 2FA-gated mutations (remove a method, disable 2FA, regenerate backup codes). Loads the caller's own account, runs a caller-specific `precondition` before spending an attempt, then verifies and applies `onMatch`.
- **`verifyAnyFactor`** (internal) — Tries `verifyInOrder`, falls through to `consumeBackupCode`.
- **`verifyInOrder`** (internal) — Recursively walks armed factor handlers sequentially; each handler may mutate its own entry (high-water mark, burned code), so a losing branch must not spend anything.
- **`consumeBackupCode`** (internal) — Scrypts the code under the account's salt, compares against **every** stored digest using `constantTimeEqual` (loop always runs to completion), then atomically spends the matching digest via `userService.spendBackupCode`.

## Relationships

- **`src/modules/account/two-factor/index.ts`** — Source of `MFA_LOCK_MS`, `MFA_MAX_FAILURES`, `hashBackupCode`, and the `TwoFactorMethodHandler` type that drives `verifyInOrder`.
- **`src/modules/account/services/two-factor-outcomes.ts`** — Provides `armedEntries` (factor ordering), `rejectWrongCode`, `rejectLocked`, and `notifyLocked` used by `settleVerdict` and `verifyArmedFactor`.
- **`src/modules/account/services/caller.ts`** — `withOwnAccount` loads and validates the caller's account before `withVerifiedCode` runs the precondition + verify chain.
- **`src/modules/users/index.ts`** — `userService` supplies the atomic attempt primitives (`reserveMfaAttempt`, `resetMfaAttempts`, `spendBackupCode`, `persistTwoFactorMethods`) and the `UserDocument` / `TwoFactorMethodRecord` types.
- **`src/infrastructure/security/constant-time.ts`** — `constantTimeEqual` is the comparison primitive inside `consumeBackupCode`, ensuring the loop's running time does not reveal which digest (if any) matched.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the returned response objects.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` is the catch-all for unexpected DB errors in `withVerifiedCode`.
- **`src/infrastructure/i18n/index.ts`** — `t` localizes the "not enabled" rejection in `proveSecondFactor`.
- **`src/modules/account/services/reauth.ts`** — Consumer: calls `proveSecondFactor` as the `otp` step of the re-auth endpoint.

## Notes

- **Ordering is a security invariant, not a convenience.** Backup codes are tried *after* every armed factor has declined. Reversing the order would let a stolen backup list shadow a working authenticator.
- **Backup-code comparison always scans all digests.** The `for` loop in `consumeBackupCode` does not early-exit on a match; it sets a flag and runs to completion so timing does not leak the position of the match.
- **`verifyInOrder` is recursive on purpose.** The chain must stay strictly sequential because each handler mutates its own entry; a parallel or short-circuit evaluation could spend state on a losing branch.
- **The attempt is reserved before comparison.** `reserveMfaAttempt` is a single atomic write; parallel bursts cannot all read "under the cap." A successful match then returns the counter via `resetMfaAttempts`.
- **Enrollment `/confirm` does not pass through this file.** It verifies a factor that is not yet armed, so a miss there would not guard anything.
- **`withVerifiedCode`'s `precondition` runs before the attempt is spent.** Returning a `ResponseReject` from `precondition` short-circuits the whole flow without consuming a lockout slot.
