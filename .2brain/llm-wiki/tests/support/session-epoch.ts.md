---
source: tests/support/session-epoch.ts
sha256: a8e182fc686f7e1ba82a2300e7439dabbaec38df57a23bf86f20e32d1d690d81
generated_at: 2026-11-08T09:59:33.280360+00:00
model: ollama:qwen3.8:27b
---

# tests/support/session-epoch.ts

## Purpose

Test-support utility that lets factor-focused integration tests retain their original login bearer token after a 2FA factor change. Changing a factor advances `tokensValidAfter`, which invalidates every session row and kills the caller's access token. Tests that exercise factors (not the re-mint swap) call `forgetSessionEpoch` to undo that invalidation in the database.

## Key elements

- **`forgetSessionEpoch(bearer: string)`** — the sole export. Accepts a JWT (with or without a `Bearer ` prefix). It:
  1. Decodes the token to extract `sub` (user id) and `sid` (session family id).
  2. Clears `tokensValidAfter` on **all** user documents via `userRepository.updateMany`.
  3. Calls `sessionRepository.familyActivity` to check whether the family still has a live session row.
  4. If no activity is found, inserts a fresh session row (mode `jwt`, 1-hour expiry) so the bearer is recognised again.

## Relationships

- **`src/domain-primitives/time.ts`** — provides `HOUR_MS`, used as the session `expiresAt` offset.
- **`src/modules/account/repository.ts`** — provides `sessionRepository`, used for the `familyActivity` check and the fallback `insert`.
- **`src/modules/users/tests/factories.ts`** — provides the `userRepository` instance (a test factory) used for the `updateMany` clear.
- **`src/modules/users/repository.ts`** — underlying repository behind the factory's `updateMany` call.
- **Consumers** (all integration tests that need a stable bearer across a factor change):
  - `src/modules/account/tests/integration/session-remint-amr.test.ts`
  - `src/modules/account/tests/integration/step-up-otp.test.ts`
  - `src/modules/account/tests/integration/two-factor-concurrency.test.ts`
  - `src/modules/account/tests/integration/two-factor.test.ts`
  - `tests/integration/staff-second-factor.test.ts`

## Notes

- The `updateMany({}, …)` in `forgetSessionEpoch` is **unscoped** — it clears `tokensValidAfter` on every account in the test database, not just the one in the bearer. This is safe in isolation tests but means callers must not rely on other accounts retaining their epoch.
- The function is a deliberate workaround: the actual epoch / re-mint behaviour is tested in `src/modules/account/tests/integration/session-epoch.test.ts`, which is **not** a graph neighbor of this file and does not use this helper.
- The inserted fallback session uses a random `tokenHash` (`new Types.ObjectId().toHexString()`), so it cannot be replayed by an actual client; it exists only to satisfy the server's "session row exists" check for the original bearer.
