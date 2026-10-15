---
source: tests/support/session-epoch.ts
sha256: c3f0a03d7b8ff91e21f81156bb993e6c24d225fedab9ca222526177fa7927164
generated_at: 2026-10-15T13:01:27.873162+00:00
model: ollama:qwen3.8:27b
---

# tests/support/session-epoch.ts

## Purpose

Test helper that "un-forgets" a session epoch after a 2FA factor change. In production a factor change bumps `tokensValidAfter`, killing the caller's access token; a real client would re-mint via its refresh cookie. Suites that test the *factor* logic (not that swap) call this function to keep their login bearer alive so they don't have to re-authenticate mid-test.

## Key elements

- **`forgetSessionEpoch(bearer: string): Promise<unknown>`** — The sole export. Accepts a raw JWT or a `Bearer <jwt>` header value (strips the prefix via regex). Decodes the token to extract `sub` (user ID) and `sid` (session family ID), then:
  1. Unsets `tokensValidAfter` on **all** user rows (`userRepository.updateMany({}, …)`).
  2. Calls `sessionRepository.familyActivity(id, sid, 'jwt', now)` to check whether the session family still has activity.
  3. If no activity row exists, inserts a fresh session document (`mode: 'jwt'`, random `tokenHash`, 1-hour expiry) so the family is restored.

## Relationships

- **`@modules/users/tests/factories`** (`src/modules/users/tests/factories.ts`) — imports `userRepository`, which provides the `updateMany` call that clears `tokensValidAfter`.
- **`src/modules/account/repository.ts`** — imports `sessionRepository`, used for `familyActivity` lookup and the fallback `insert` of a session row.
- **Test consumers** (`two-factor.test.ts`, `two-factor-concurrency.test.ts`, `step-up-otp.test.ts`, `session-remint-amr.test.ts`, `two-factor.contract.test.ts`) — call `forgetSessionEpoch` after triggering a factor change to preserve their login token for subsequent assertions.

## Notes

- The `updateMany({}, …)` filter is intentionally a no-op match: it clears the epoch on *every* account in the test database. This is a test-environment convenience; do not reuse this pattern outside test support code.
- The `tokenHash` on the inserted session is a random `ObjectId().toHexString()` — it will never match a real token, since this row only re-establishes the *family* existence, not a valid credential.
- The epoch mechanism itself (what bumps `tokensValidAfter`, how sessions are terminated) is covered in `src/modules/account/tests/integration/session-epoch.test.ts`, not here.
