---
source: src/modules/account/services/two-factor-lockout.ts
sha256: 50169d764822db136d29832a8beffc1d368396df4fcd8a2395a1b4a1ec0a9efd
generated_at: 2026-11-14T18:53:54.188341+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-lockout.ts

## Purpose

Central verification entry point for checking a one-time code against an account's armed two-factor methods (and, as a fallback, backup codes), enforced behind a per-account wrong-code cap. Every flow that asks a signed-in user for a second-factor code routes through this file; it owns the reserve → compare → settle lifecycle and the lockout accounting.

## Key elements

- **`FactorVerdict`** (exported type) — the three-way outcome of a single check: `'matched'`, `'wrong'`, or `'locked'`.
- **`verifyArmedFactor(user, code, context)`** (exported) — reserves an MFA attempt atomically via `accountUserService.reserveMfaAttempt`, then delegates to `verifyAnyFactor`. On match, resets the counter; on lock, notifies and short-circuits without comparing.
- **`settleVerdict(verdict, user, onMatch)`** (exported) — maps a `FactorVerdict` to an HTTP response: calls `onMatch` for success, returns a lock rejection (429) or wrong-code rejection (422).
- **`proveSecondFactor(user, code, context)`** (exported) — the `otp` half of `POST /account/reauth`; guards on `twoFactorEnabledAt` then runs `verifyArmedFactor` → `settleVerdict`, persisting factor state on success.
- **`withVerifiedCode<T>(userId, code, context, precondition, onMatch)`** (exported) — generic wrapper for the three self-service mutations (remove method, disable 2FA, regenerate backup codes): loads the caller, runs a caller-specific precondition, verifies the code, and applies the mutation. Catches DB errors into a `rejectDatabaseEnvelope`.
- **`consumeBackupCode`** (internal) — hashes the code with the account's scrypt salt, constant-time-compares against every stored digest (no early exit), then atomically spends it.
- **`verifyInOrder`** (internal) — recursively walks armed factor handlers sequentially; each handler mutates its own entry, so order and non-parallelism are invariants.
- **`verifyAnyFactor`** (internal) — tries `verifyInOrder` first, falls back to `consumeBackupCode`.

## Relationships

- **`src/modules/users/friends/account.ts`** — provides `accountUserService`, the data-layer for all MFA state mutations (reserve, reset, spend backup code, persist methods).
- **`src/modules/account/services/two-factor-outcomes.ts`** — supplies `armedEntries` (ordered factor list), `rejectWrongCode`, `rejectLocked`, and `notifyLocked` used in the response path.
- **`src/modules/account/two-factor/index.ts`** (barrel) — source of `MFA_LOCK_MS`, `MFA_MAX_FAILURES`, `hashBackupCode`, and the `TwoFactorMethodHandler` type.
- **`src/modules/account/services/caller.ts`** — `withOwnAccount` loads the caller's `UserDocument` for `withVerifiedCode`.
- **`src/infrastructure/security/constant-time.ts`** — `constantTimeEqual` used in the backup-code digest comparison loop.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` for the DB-error catch in `withVerifiedCode`.
- **`src/infrastructure/i18n/index.ts`** — `t()` for the "not enabled" message in `proveSecondFactor`.
- **`src/modules/account/services/reauth.ts`** — upstream caller of `proveSecondFactor` (the `otp` endpoint).

## Notes

- **Backup codes are always tried last.** A stolen backup-code list must never shadow a still-working authenticator; the ordering in `verifyAnyFactor` is intentional and non-negotiable.
- **The backup-code digest loop never short-circuits.** All stored digests are compared before returning, so wall-clock time leaks no information about which slot (if any) matched.
- **`verifyInOrder` is recursive on purpose.** Each handler mutates its entry (TOTP high-water mark, burned code); a losing branch must not consume anything, so strict sequential evaluation is a correctness requirement, not a style choice.
- **Enrolment `/confirm` does not pass through this file.** It checks a factor that is not yet armed, so a miss there would not advance the lockout counter.
- **The attempt reservation is a single atomic write.** Parallel requests cannot all read "under the cap"; the second and later callers get `reserved: false` and receive the lock response without ever comparing the code.
- **`withVerifiedCode` is the only export that takes `userId` (a string)** rather than a pre-loaded `UserDocument`; it resolves the document itself via `withOwnAccount`.
