---
source: src/modules/account/services/two-factor-lockout.ts
sha256: 1e94ae87d3ded878c9914c8271a18c641cc3503d44b0c4cf31f8506d907a57dc
generated_at: 2026-11-08T04:24:44.338110+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-lockout.ts

## Purpose

Central code-verification chokepoint for every 2FA flow that checks a user-supplied code against an account's armed factors. Enforces the per-account wrong-code cap (lockout) via an atomic reservation before any comparison, and guarantees a strict evaluation order: armed factors first, backup codes last. All entry points that accept a 2FA code funnel through this file.

## Key elements

- **`verifyArmedFactor(user, code, context)`** — Core exported function. Reserves one attempt slot atomically (preventing parallel-burst under-cap reads), then calls `verifyAnyFactor`. Returns a `FactorVerdict` (`'matched' | 'wrong' | 'locked'`). A matched code resets the failure counter.
- **`FactorVerdict`** — Exported union type: `'matched' | 'wrong' | 'locked'`. Distinguishes a successful verify, a consumed-but-wrong attempt, and a locked account where nothing was compared.
- **`settleVerdict<T>(verdict, user, onMatch)`** — Translates a verdict into an HTTP response. Calls `onMatch` for `'matched'`, returns a 429 rejection for `'locked'`, and delegates to `rejectWrongCode` for `'wrong'`.
- **`proveSecondFactor(user, code, context)`** — Reauth (`POST /account/reauth`) entry point. Guards on `twoFactorEnabledAt`, verifies, and on success persists the spent factor state (TOTP step, burned backup code) so the caller has nothing further to write.
- **`withVerifiedCode<T>(userId, code, context, precondition, onMatch)`** — Shared shape for the three caller-gated 2FA mutations (remove method, disable 2FA, regenerate backup codes). Runs a caller-specific `precondition` before spending an attempt, then verifies and applies `onMatch`.
- **`consumeBackupCode`** (private) — Scrypt-hashes the code under the account salt, compares against *every* stored digest with `constantTimeEqual` (no early exit), then performs one atomic `spendBackupCode` pull.
- **`verifyInOrder`** (private) — Recursive, strictly sequential chain over armed factor entries; each handler mutates its own entry only on a match.
- **`verifyAnyFactor`** (private) — Composes `verifyInOrder` then `consumeBackupCode`, enforcing the "factors before backup codes" ordering.

## Relationships

- **`src/modules/account/two-factor/`** (`index.ts`, `registry.ts`, `backup-codes.ts`) — Imports `MFA_LOCK_MS`, `MFA_MAX_FAILURES`, `hashBackupCode`, and the `TwoFactorMethodHandler` type that each armed factor's `verify` method must implement.
- **`src/modules/account/services/two-factor-outcomes.ts`** — Imports `armedEntries` (builds the ordered factor list), `rejectWrongCode`, `rejectLocked`, and `notifyLocked` for the response/notification layer.
- **`src/modules/account/services/caller.ts`** — Imports `withOwnAccount` to load the caller's own document inside `withVerifiedCode`.
- **`src/modules/users/index.ts`** — Uses `userService` for `reserveMfaAttempt`, `resetMfaAttempts`, `spendBackupCode`, and `persistTwoFactorMethods`; consumes `UserDocument` and `TwoFactorMethodRecord` types.
- **`src/infrastructure/security/constant-time.ts`** — `constantTimeEqual` is used in the backup-code comparison loop to eliminate a timing oracle.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` and their type aliases form the return types of the exported functions.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` wraps unexpected DB errors in `withVerifiedCode`.
- **`src/infrastructure/i18n/`** — `t()` localises the "not enabled" rejection message in `proveSecondFactor` and (via `notifyLocked`) the lock notice.

## Notes

- **Ordering is a security invariant, not a style choice.** Backup codes are *always* tried after every armed factor has declined. Reversing the order would let a stolen backup-code list shadow a working authenticator.
- **No early-exit in the backup-code loop.** All stored digists are compared even after a match, so the running time never reveals *which* position matched.
- **Reservation precedes comparison.** The atomic `reserveMfaAttempt` write happens before any factor is checked, so a parallel burst cannot all read "under the cap" and all compare.
- **`lockedNow` can coexist with `reserved: true`.** The account may have just crossed the threshold on this very attempt; a lock notice is sent but no comparison is performed.
- **Enrolment `/confirm` bypasses this file entirely.** It verifies a factor that is not yet armed, so a miss there guards nothing and must not spend a lockout attempt.
- **`verifyInOrder` is deliberately recursive** (not `for…of`) to keep the chain strictly sequential and to make each handler's mutation (replay high-water mark, burned code) isolated to a matching branch only.
