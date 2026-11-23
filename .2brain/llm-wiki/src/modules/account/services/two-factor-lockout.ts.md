---
source: src/modules/account/services/two-factor-lockout.ts
source_sha256: 50169d764822db136d29832a8beffc1d368396df4fcd8a2395a1b4a1ec0a9efd
context_sha256: 48f0118ff8dce2f32ef65276448fe8c907de0ac2014813304257c3c1b0c3f9e6
generated_at: 2026-11-22T03:43:38.116255+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/two-factor-lockout.ts

## Purpose
Checks a submitted code against an account's armed second factors (and backup codes) behind a per-account wrong-code cap. Every flow that asks for a code goes through this file, so the lockout rules live in one place.

## Key elements
- `FactorVerdict` – `'matched' | 'wrong' | 'locked'`.
- `verifyArmedFactor(user, code, context)` – reserves an attempt with one atomic write (`reserveMfaAttempt`, using `MFA_MAX_FAILURES` / `MFA_LOCK_MS`). If no reservation was made it returns `'locked'` without comparing anything. If this attempt triggered the lock, it calls `notifyLocked`. Otherwise it verifies the code, and a match resets the counter (`resetMfaAttempts`).
- `settleVerdict(verdict, user, onMatch)` – maps a verdict to a response. `matched` runs `onMatch`, `locked` returns `rejectLocked`, and `wrong` returns `rejectWrongCode`.
- `proveSecondFactor(user, code, context)` – the `otp` half of `POST /account/reauth`. It returns 422 if `twoFactorEnabledAt` is unset, and otherwise verifies and persists the method state with `persistTwoFactorMethods`. Per its docs, a wrong code also gives 422 and a locked account gives 429.
- `withVerifiedCode(userId, code, context, precondition, onMatch)` – the shared shape for the caller's own 2FA actions (remove a method, disable 2FA, regenerate backup codes). It loads the caller via `withOwnAccount` and runs `precondition`, which can reject before any attempt is spent. It then verifies the code and runs `onMatch`. Errors become `rejectDatabaseEnvelope('auth', error)`.
- Internal helpers:
  - `verifyInOrder` walks the armed factors sequentially and stops at the first match.
  - `verifyAnyFactor` tries the armed factors, then backup codes.
  - `consumeBackupCode` hashes the code with the account's salt, compares it against every stored digest using `constantTimeEqual`, and spends the code via `accountUserService.spendBackupCode`.

## Relationships
- `src/modules/account/services/two-factor-outcomes.ts` supplies `armedEntries`, `rejectWrongCode`, `rejectLocked` and `notifyLocked`.
- `src/modules/account/services/caller.ts` supplies `withOwnAccount`.
- `src/modules/account/two-factor/index.ts` supplies `MFA_LOCK_MS`, `MFA_MAX_FAILURES`, `hashBackupCode` and the `TwoFactorMethodHandler` type. Each armed factor's handler provides `verify`.
- `src/modules/users/friends/account.ts` (`accountUserService`) holds the persistence: `reserveMfaAttempt`, `resetMfaAttempts`, `spendBackupCode` and `persistTwoFactorMethods`.
- `src/infrastructure/security/constant-time.ts` supplies `constantTimeEqual`.
- `src/infrastructure/http/response.ts` and `src/infrastructure/http/errors.ts` supply `generateSuccess`, `generateReject` and `rejectDatabaseEnvelope`.
- `src/infrastructure/i18n/index.ts` supplies `t` for the "not enabled" message.
- `CallerContext` (from `@types`) provides the locale fallback for the lock notice.

## Notes
- The attempt is reserved before the comparison, so a parallel burst cannot all read "under the cap" together.
- Backup codes are tried only after every armed factor has declined. Otherwise a stolen backup list could shadow a working authenticator.
- The backup-code loop never exits early, so its timing does not reveal which stored position matched. The spend is a single conditional pull, so of two requests with the same code only one succeeds.
- Factors are verified strictly sequentially, because each handler mutates its own entry (a replay high-water mark, a burned code) and a losing branch must not spend anything.
- Enrolment `/confirm` deliberately does not use this file, since it checks a factor that is not armed yet.
- `proveSecondFactor` persists a spent backup code or TOTP step itself, so the caller has nothing left to write.
